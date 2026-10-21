use crate::state::CCState;
use claude_agent_sdk_rs::{Message, ResultMessage, UserContentBlock};
use futures::StreamExt;

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

/// Sends one prompt and streams the turn to `message_callback` until its result.
///
/// The callback receives the session's client key with each message. When `/clear`
/// resets the conversation, the CLI continues under a new session id: after the
/// turn's result the client moves to that id and `cc-session-renamed` is emitted.
/// A turn that fails or ends without a result gets an error result, so callers
/// always see the turn finish.
pub(crate) async fn send_message_and_wait(
    session_id: &str,
    message: &str,
    image_paths: &[String],
    state: &CCState,
    mut message_callback: impl FnMut(&str, Message) + Send,
) -> Result<(), String> {
    let mut key = session_id.to_string();
    let outcome = stream_turn(&mut key, message, image_paths, state, &mut message_callback).await;
    if let Err(err) = &outcome {
        message_callback(&key, error_result(&key, err.clone()));
    }
    outcome
}

async fn stream_turn(
    key: &mut String,
    message: &str,
    image_paths: &[String],
    state: &CCState,
    message_callback: &mut (impl FnMut(&str, Message) + Send),
) -> Result<(), String> {
    let client = state
        .get_client(key)
        .await
        .ok_or("Client not found")?;

    {
        let mut client = client.write().await;
        client.connect().await.map_err(|e| e.to_string())?;
    }

    if image_paths.is_empty() {
        let mut client = client.write().await;
        client.query_with_session(message, key.as_str()).await.map_err(|e| e.to_string())?;
    } else {
        let mut content: Vec<UserContentBlock> = Vec::new();
        if !message.is_empty() {
            content.push(UserContentBlock::text(message));
        }
        for path in image_paths {
            content.push(image_path_to_content_block(path)?);
        }
        if content.is_empty() {
            content.push(UserContentBlock::text(""));
        }
        let mut client = client.write().await;
        client
            .query_with_content_and_session(content, key.as_str())
            .await
            .map_err(|e| e.to_string())?;
    }

    // Set by a conversation reset; the next message reporting a session id names
    // the session the CLI continues under.
    let mut reset_pending = false;
    let mut renamed_to: Option<String> = None;
    loop {
        let result = {
            // Use a read lock so interrupt() can acquire a concurrent read lock
            let client = client.read().await;
            let mut stream = client.receive_response();
            stream.next().await
        };

        match result {
            Some(Ok(msg)) => {
                if matches!(msg, Message::ConversationReset(_)) {
                    reset_pending = true;
                } else if reset_pending && let Some(new_id) = cli_session_id(&msg) {
                    reset_pending = false;
                    if new_id != key.as_str() {
                        renamed_to = Some(new_id.to_string());
                    }
                }
                let is_result = matches!(msg, Message::Result(_));
                message_callback(key, msg);
                if is_result {
                    // Rename once the turn has finished under the old key, so
                    // listeners never miss its result while they switch ids.
                    if let Some(new_id) = renamed_to {
                        state.rename_client(key, &new_id).await;
                        state.emit(
                            "cc-session-renamed",
                            serde_json::json!({ "sessionId": key.as_str(), "newSessionId": new_id }),
                        );
                        *key = new_id;
                    }
                    return Ok(());
                }
            }
            Some(Err(e)) => return Err(e.to_string()),
            None => return Err("Claude Code exited before finishing the turn".to_string()),
        }
    }
}

pub async fn send_message(
    session_id: &str,
    message: &str,
    image_paths: &[String],
    state: &CCState,
    message_callback: impl Fn(&str, Message) + Send + 'static,
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
            message_callback,
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
            let (state, _) = state_with_fake_cli("fake_cli_exit_mid_turn.sh", "s1").await;
            let seen: Arc<Mutex<Vec<Message>>> = Arc::default();
            let recorder = Arc::clone(&seen);
            let outcome = send_message_and_wait("s1", "hi", &[], &state, move |_, msg| {
                recorder.lock().unwrap().push(msg);
            })
            .await;

            assert!(outcome.is_err());
            let seen = seen.lock().unwrap();
            let Some(Message::Result(last)) = seen.last() else {
                panic!("expected a closing result, got {seen:?}");
            };
            assert!(last.is_error);
            assert_eq!(last.session_id, "s1");
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

            // The whole turn, result included, is delivered under the old key.
            assert_eq!(*keys.lock().unwrap(), vec!["old", "old"]);
            assert!(state.get_client("old").await.is_none());
            assert!(state.get_client("new").await.is_some());
            let events = sink.0.lock().unwrap();
            assert_eq!(
                *events,
                vec![(
                    "cc-session-renamed".to_string(),
                    serde_json::json!({ "sessionId": "old", "newSessionId": "new" })
                )]
            );
        }
    }
}
