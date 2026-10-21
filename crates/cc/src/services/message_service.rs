use crate::state::{CCState, SessionStream};
use claude_agent_sdk_rs::{ClaudeClient, Message, ResultMessage, UserContentBlock};
use futures::StreamExt;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

fn image_path_to_content_block(path: &str) -> Result<UserContentBlock, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("Failed to read image {path}: {e}"))?;
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/png",
    };
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    UserContentBlock::image_base64(mime, &b64).map_err(|e| e.to_string())
}

/// The CLI session id a message reports, if it carries one.
fn cli_session_id(message: &Message) -> Option<&str> {
    match message {
        Message::Assistant(m) => m.session_id.as_deref(),
        Message::System(m) => m.session_id.as_deref(),
        Message::Result(m) => Some(m.session_id.as_str()),
        Message::StreamEvent(m) => Some(m.session_id.as_str()),
        _ => None,
    }
}

/// An error result for a turn that ended without one, so listeners stop
/// waiting and show why.
fn error_result(session_id: &str, error: String) -> Message {
    Message::Result(ResultMessage {
        subtype: "error_during_execution".to_string(),
        duration_ms: 0,
        duration_api_ms: 0,
        is_error: true,
        num_turns: 0,
        session_id: session_id.to_string(),
        total_cost_usd: None,
        usage: None,
        result: Some(error),
        structured_output: None,
        stop_reason: None,
        model_usage: None,
        permission_denials: None,
        deferred_tool_use: None,
        errors: None,
        api_error_status: None,
        uuid: None,
        terminal_reason: None,
        origin: None,
    })
}

/// Sends the session's messages to the frontend as `cc-message`, stamped with
/// its client key so messages that carry no session id, or a forked one, still
/// reach the right card.
fn emit_message(state: &CCState, key: &str, message: &Message) {
    match serde_json::to_value(message) {
        Ok(mut payload) => {
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("session_id".to_string(), serde_json::Value::String(key.to_string()));
            }
            state.emit("cc-message", payload);
        }
        Err(err) => log::error!("Failed to serialize CC message event: {}", err),
    }
}

/// Starts reading a connected session's messages, once per CLI process.
///
/// The reader runs until the CLI exits: it emits every message to the frontend
/// and hands each turn to whoever waits for it. Turns the session starts on its
/// own, like the one after a background agent finishes, arrive after the result
/// of the turn that launched them and reach the frontend the same way.
///
/// When `/clear` resets the conversation, the CLI continues under a new session
/// id: after the turn's result the client moves to that id and
/// `cc-session-renamed` is emitted, so listeners never miss the result while
/// they switch ids.
fn start_reader(key: &str, client: &ClaudeClient, state: &CCState) -> Arc<SessionStream> {
    let stream = Arc::new(SessionStream::default());
    state.streams.insert(key.to_string(), Arc::clone(&stream));
    // The key follows renames through the id arc shared with permission hooks.
    let key_arc = state
        .session_arcs
        .entry(key.to_string())
        .or_insert_with(|| Arc::new(Mutex::new(key.to_string())))
        .clone();
    let mut messages = client.receive_messages();
    let state = state.clone();
    let reader = Arc::clone(&stream);

    tokio::spawn(async move {
        let mut reset_pending = false;
        let mut renamed_to: Option<String> = None;
        while let Some(next) = messages.next().await {
            let msg = match next {
                Ok(msg) => msg,
                Err(err) => {
                    log::warn!("[CC] skipping unreadable message: {}", err);
                    continue;
                }
            };
            let key = key_arc.lock().unwrap().clone();
            if matches!(msg, Message::ConversationReset(_)) {
                reset_pending = true;
            } else if reset_pending && let Some(new_id) = cli_session_id(&msg) {
                reset_pending = false;
                if new_id != key {
                    renamed_to = Some(new_id.to_string());
                }
            }

            let is_result = matches!(msg, Message::Result(_));
            match &msg {
                Message::System(system) if system.subtype == "background_tasks_changed" => {
                    let running = system.data.get("tasks").and_then(|tasks| tasks.as_array());
                    reader
                        .background_tasks
                        .store(running.map_or(0, Vec::len), Ordering::SeqCst);
                }
                // Task updates also arrive between turns.
                Message::System(system) if system.subtype.starts_with("task_") => {}
                _ => reader.in_turn.store(!is_result, Ordering::SeqCst),
            }
            emit_message(&state, &key, &msg);
            // Rename before the waiters see the result, so a caller that closes
            // the session when its turn ends closes it under its current id.
            if is_result && let Some(new_id) = renamed_to.take() {
                state.rename_client(&key, &new_id).await;
                state.emit(
                    "cc-session-renamed",
                    serde_json::json!({ "sessionId": key, "newSessionId": new_id }),
                );
            }
            let mut waiters = reader.waiters.lock().unwrap();
            waiters.retain(|waiter| waiter.send(msg.clone()).is_ok());
            if is_result {
                waiters.clear();
            }
            drop(waiters);
            reader.activity.send_modify(|count| *count += 1);
        }

        // The CLI exited. Waiters see their channel close and report their turn;
        // a turn nobody waits for is reported here, unless the session was
        // closed on purpose.
        let waited = {
            let mut waiters = reader.waiters.lock().unwrap();
            let waited = !waiters.is_empty();
            waiters.clear();
            waited
        };
        reader.closed.store(true, Ordering::SeqCst);
        reader.activity.send_modify(|count| *count += 1);
        let key = key_arc.lock().unwrap().clone();
        let registered = state
            .streams
            .get(&key)
            .is_some_and(|current| Arc::ptr_eq(&current, &reader));
        if registered {
            state.streams.remove(&key);
            if !waited && reader.in_turn.load(Ordering::SeqCst) {
                let error = "Claude Code exited before finishing the turn".to_string();
                emit_message(&state, &key, &error_result(&key, error));
            }
        }
    });
    stream
}

/// Sends one prompt and waits for its turn to finish.
///
/// Each message of the turn is passed to `message_callback` with the session's
/// client key; the session's reader also emits them to the frontend. The key
/// changes after a `/clear` turn (see [`start_reader`]). A turn that fails or ends
/// without a result gets an error result, so callers and the frontend always see
/// the turn finish.
pub(crate) async fn send_message_and_wait(
    session_id: &str,
    message: &str,
    image_paths: &[String],
    state: &CCState,
    mut message_callback: impl FnMut(&str, Message) + Send,
) -> Result<(), String> {
    let outcome = run_turn(session_id, message, image_paths, state, &mut message_callback).await;
    if let Err(err) = &outcome {
        let key = state
            .session_arcs
            .get(session_id)
            .map(|arc| arc.lock().unwrap().clone())
            .unwrap_or_else(|| session_id.to_string());
        let result = error_result(&key, err.clone());
        emit_message(state, &key, &result);
        message_callback(&key, result);
    }
    outcome
}

async fn run_turn(
    key: &str,
    message: &str,
    image_paths: &[String],
    state: &CCState,
    message_callback: &mut (impl FnMut(&str, Message) + Send),
) -> Result<(), String> {
    let client = state.get_client(key).await.ok_or("Client not found")?;

    let mut content: Vec<UserContentBlock> = Vec::new();
    if !image_paths.is_empty() {
        if !message.is_empty() {
            content.push(UserContentBlock::text(message));
        }
        for path in image_paths {
            content.push(image_path_to_content_block(path)?);
        }
    }

    let (mut turn, key_arc) = {
        let mut client = client.write().await;
        client.connect().await.map_err(|e| e.to_string())?;
        let stream = match state.streams.get(key) {
            Some(stream) => Arc::clone(&stream),
            None => start_reader(key, &client, state),
        };
        let key_arc = state.session_arcs.get(key).map(|arc| Arc::clone(&arc));
        // Wait on the turn before sending it, so none of its messages are missed.
        let (tx, rx) = mpsc::unbounded_channel();
        stream.waiters.lock().unwrap().push(tx);
        stream.in_turn.store(true, Ordering::SeqCst);
        let sent = if content.is_empty() {
            client.query_with_session(message, key).await
        } else {
            client.query_with_content_and_session(content, key).await
        };
        sent.map_err(|e| e.to_string())?;
        (rx, key_arc)
    };

    while let Some(msg) = turn.recv().await {
        let is_result = matches!(msg, Message::Result(_));
        let current = key_arc
            .as_ref()
            .map(|arc| arc.lock().unwrap().clone())
            .unwrap_or_else(|| key.to_string());
        message_callback(&current, msg);
        if is_result {
            return Ok(());
        }
    }
    Err("Claude Code exited before finishing the turn".to_string())
}

/// Waits until a session has nothing left to do: no turn in progress, no
/// background task running, and no message for `quiet`. The quiet period
/// covers the turn the CLI starts on its own right after a background task
/// finishes. Returns at once for a session that is not being read, and when
/// the CLI exits.
pub(crate) async fn wait_until_idle(key: &str, state: &CCState, quiet: std::time::Duration) {
    let Some(stream) = state.streams.get(key).map(|stream| Arc::clone(&stream)) else {
        return;
    };
    let mut activity = stream.activity.subscribe();
    loop {
        if stream.closed.load(Ordering::SeqCst) {
            return;
        }
        let busy = stream.in_turn.load(Ordering::SeqCst)
            || stream.background_tasks.load(Ordering::SeqCst) > 0;
        let changed = if busy {
            activity.changed().await
        } else {
            match tokio::time::timeout(quiet, activity.changed()).await {
                Ok(changed) => changed,
                Err(_) => return,
            }
        };
        if changed.is_err() {
            return;
        }
    }
}

/// Sends a prompt in the background; the session's reader emits its messages.
pub async fn send_message(
    session_id: &str,
    message: &str,
    image_paths: &[String],
    state: &CCState,
) -> Result<(), String> {
    if state.get_client(session_id).await.is_none() {
        return Err("Client not found".to_string());
    }

    let session_id_owned = session_id.to_string();
    let message_owned = message.to_string();
    let image_paths_owned = image_paths.to_vec();
    let state_cloned = state.clone();

    tokio::spawn(async move {
        if let Err(err) = send_message_and_wait(
            &session_id_owned,
            &message_owned,
            &image_paths_owned,
            &state_cloned,
            |_, _| {},
        )
        .await
        {
            log::error!("Error sending/receiving message: {}", err);
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_result_is_a_finished_error_turn() {
        let value = serde_json::to_value(error_result("s1", "CLI exited".to_string())).unwrap();
        assert_eq!(value["type"], "result");
        assert_eq!(value["is_error"], true);
        assert_eq!(value["session_id"], "s1");
        assert_eq!(value["result"], "CLI exited");
    }

    #[test]
    fn cli_session_id_reads_the_reporting_messages() {
        let result = error_result("s2", String::new());
        assert_eq!(cli_session_id(&result), Some("s2"));
        let reset: Message = serde_json::from_value(serde_json::json!({
            "type": "conversation_reset",
            "new_conversation_id": "c",
            "uuid": "u",
            "session_id": "s1"
        }))
        .unwrap();
        assert!(matches!(reset, Message::ConversationReset(_)));
        assert_eq!(cli_session_id(&reset), None);
    }

    #[cfg(unix)]
    mod fake_cli {
        use super::*;
        use codexia_shared::event_sink::EventSink;
        use std::sync::{Arc, Mutex};

        #[derive(Default)]
        struct RecordingSink(Mutex<Vec<(String, serde_json::Value)>>);

        impl EventSink for RecordingSink {
            fn emit(&self, event: &str, payload: serde_json::Value) {
                self.0.lock().unwrap().push((event.to_string(), payload));
            }
        }

        async fn state_with_fake_cli(script: &str, key: &str) -> (CCState, Arc<RecordingSink>) {
            let sink = Arc::new(RecordingSink::default());
            let state = CCState::new(sink.clone());
            let options = claude_agent_sdk_rs::ClaudeAgentOptions {
                cli_path: Some(
                    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                        .join("tests/fixtures")
                        .join(script),
                ),
                ..Default::default()
            };
            state.create_client(key.to_string(), options, None).await.unwrap();
            (state, sink)
        }

        #[tokio::test]
        async fn turn_without_result_ends_with_an_error_result() {
            let (state, sink) = state_with_fake_cli("fake_cli_exit_mid_turn.sh", "s1").await;
            let seen: Arc<Mutex<Vec<Message>>> = Arc::default();
            let recorder = Arc::clone(&seen);
            let outcome = send_message_and_wait("s1", "hi", &[], &state, move |_, msg| {
                recorder.lock().unwrap().push(msg);
            })
            .await;

            assert!(outcome.is_err());
            let last = seen.lock().unwrap().last().cloned();
            let Some(Message::Result(last)) = last else {
                panic!("expected a closing result, got {last:?}");
            };
            assert!(last.is_error);
            assert_eq!(last.session_id, "s1");
            // Reported to the frontend once.
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            let errors = sink.0.lock().unwrap().iter().filter(|(_, p)| p["is_error"] == true).count();
            assert_eq!(errors, 1);
        }

        #[tokio::test]
        async fn clear_moves_the_client_after_the_result() {
            let (state, sink) = state_with_fake_cli("fake_cli_clear.sh", "old").await;
            let keys: Arc<Mutex<Vec<String>>> = Arc::default();
            let recorder = Arc::clone(&keys);
            send_message_and_wait("old", "/clear", &[], &state, move |key, _| {
                recorder.lock().unwrap().push(key.to_string());
            })
            .await
            .unwrap();

            // The frontend gets the whole turn under the old key, then the rename.
            let summary: Vec<(String, String)> = sink
                .0
                .lock()
                .unwrap()
                .iter()
                .map(|(event, payload)| {
                    let id = payload.get("session_id").or_else(|| payload.get("newSessionId"));
                    (event.clone(), id.and_then(|v| v.as_str()).unwrap_or("").to_string())
                })
                .collect();
            assert_eq!(
                summary,
                vec![
                    ("cc-message".to_string(), "old".to_string()),
                    ("cc-message".to_string(), "old".to_string()),
                    ("cc-session-renamed".to_string(), "new".to_string()),
                ]
            );
            // The caller learns the new id with the result, so it can close it.
            assert_eq!(keys.lock().unwrap().last().map(String::as_str), Some("new"));
            assert!(state.get_client("old").await.is_none());
            assert!(state.get_client("new").await.is_some());
        }

        fn results(events: &[(String, serde_json::Value)]) -> Vec<String> {
            events
                .iter()
                .filter(|(_, payload)| payload["type"] == "result")
                .map(|(_, payload)| payload["result"].as_str().unwrap_or("").to_string())
                .collect()
        }

        #[tokio::test]
        async fn turns_the_session_starts_on_its_own_reach_the_frontend() {
            let (state, sink) = state_with_fake_cli("fake_cli_background_turn.sh", "s1").await;

            send_message_and_wait("s1", "launch", &[], &state, |_, _| {}).await.unwrap();
            // The follow-up turn arrives after the launching turn's result.
            tokio::time::timeout(std::time::Duration::from_secs(5), async {
                while !results(&sink.0.lock().unwrap()).contains(&"second".to_string()) {
                    tokio::time::sleep(std::time::Duration::from_millis(20)).await;
                }
            })
            .await
            .expect("the session's own turn must reach the frontend");

            // The next prompt's turn is its own, not the leftovers of the last one.
            let seen: Arc<Mutex<Vec<Message>>> = Arc::default();
            let recorder = Arc::clone(&seen);
            send_message_and_wait("s1", "next", &[], &state, move |_, msg| {
                recorder.lock().unwrap().push(msg);
            })
            .await
            .unwrap();
            let seen = seen.lock().unwrap();
            let Some(Message::Result(last)) = seen.last() else {
                panic!("expected a result, got {seen:?}");
            };
            assert_eq!(last.result.as_deref(), Some("third"));
            assert_eq!(results(&sink.0.lock().unwrap()), vec!["first", "second", "third"]);
        }

        #[tokio::test]
        async fn idle_waits_for_background_tasks_and_the_turn_after_them() {
            let (state, sink) = state_with_fake_cli("fake_cli_background_turn.sh", "s1").await;
            send_message_and_wait("s1", "launch", &[], &state, |_, _| {}).await.unwrap();
            // Quieter than the agent's run: only the running task keeps it waiting.
            tokio::time::timeout(
                std::time::Duration::from_secs(5),
                wait_until_idle("s1", &state, std::time::Duration::from_millis(100)),
            )
            .await
            .expect("the session goes idle");
            assert_eq!(results(&sink.0.lock().unwrap()), vec!["first", "second"]);
        }

        #[tokio::test]
        async fn closing_a_session_is_not_reported_as_a_failed_turn() {
            let (state, sink) = state_with_fake_cli("fake_cli_background_turn.sh", "s1").await;
            send_message_and_wait("s1", "launch", &[], &state, |_, _| {}).await.unwrap();
            // Closed while its own follow-up turn is still running.
            state.remove_client("s1").await.unwrap();
            tokio::time::sleep(std::time::Duration::from_millis(400)).await;
            let events = sink.0.lock().unwrap();
            assert!(events.iter().all(|(_, payload)| payload["is_error"] != true));
        }
    }
}
