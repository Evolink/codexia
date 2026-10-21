use codexia_shared::event_sink::EventSink;
use claude_agent_sdk_rs::{ClaudeAgentOptions, ClaudeClient};
use dashmap::DashMap;
use serde_json::Value;
use claude_agent_sdk_rs::Message;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicUsize};
use std::sync::{Arc, Mutex};
use tokio::sync::{mpsc, oneshot, watch, Mutex as AsyncMutex, RwLock};

pub type ClientId = String;

/// Session-specific metadata
pub struct SessionMetadata {
    pub permission_mode: Option<String>,
}

/// The reader of a connected session's messages. It runs for the life of the CLI
/// process, so turns the session starts on its own (after a background agent
/// finishes) reach the frontend too.
pub struct SessionStream {
    /// Senders waiting for the current turn; each gets its messages up to and
    /// including the result.
    pub(crate) waiters: Mutex<Vec<mpsc::UnboundedSender<Message>>>,
    /// A turn has started and not yet reported its result.
    pub(crate) in_turn: AtomicBool,
    /// Background tasks (agents, shells) the CLI reports as still running.
    pub(crate) background_tasks: AtomicUsize,
    /// The CLI has exited.
    pub(crate) closed: AtomicBool,
    /// Bumped on every message and when the CLI exits.
    pub(crate) activity: watch::Sender<u64>,
}

impl Default for SessionStream {
    fn default() -> Self {
        Self {
            waiters: Mutex::default(),
            in_turn: AtomicBool::default(),
            background_tasks: AtomicUsize::default(),
            closed: AtomicBool::default(),
            activity: watch::Sender::new(0),
        }
    }
}

#[derive(Clone)]
pub struct CCState {
    pub clients: Arc<AsyncMutex<HashMap<ClientId, Arc<RwLock<ClaudeClient>>>>>,
    /// Pending permission requests: request_id -> oneshot sender for the decision
    pub pending_permissions: Arc<DashMap<String, oneshot::Sender<String>>>,
    /// Session metadata (permission_mode, etc.)
    pub session_metadata: Arc<DashMap<ClientId, SessionMetadata>>,
    /// Arc<Mutex<String>> for each session's effective ID, shared with permission hooks.
    pub session_arcs: Arc<DashMap<String, Arc<Mutex<String>>>>,
    /// Message readers of connected sessions, by client id.
    pub(crate) streams: Arc<DashMap<ClientId, Arc<SessionStream>>>,
    /// Event sink for emitting events to the frontend (Tauri or WebSocket).
    pub sink: Arc<dyn EventSink>,
}

struct NoOpSink;
impl EventSink for NoOpSink {
    fn emit(&self, _event: &str, _payload: Value) {}
}

impl CCState {
    pub fn new(sink: Arc<dyn EventSink>) -> Self {
        Self {
            clients: Arc::new(AsyncMutex::new(HashMap::new())),
            pending_permissions: Arc::new(DashMap::new()),
            session_metadata: Arc::new(DashMap::new()),
            session_arcs: Arc::new(DashMap::new()),
            streams: Arc::new(DashMap::new()),
            sink,
        }
    }

    pub fn emit(&self, event: &str, payload: Value) {
        self.sink.emit(event, payload);
    }

    pub async fn get_client(&self, client_id: &str) -> Option<Arc<RwLock<ClaudeClient>>> {
        let clients = self.clients.lock().await;
        clients.get(client_id).cloned()
    }

    pub async fn create_client(
        &self,
        client_id: String,
        options: ClaudeAgentOptions,
        permission_mode: Option<String>,
    ) -> Result<(), String> {
        let mut clients = self.clients.lock().await;

        // Note: we always replace the client to ensure new options (like emitter/hooks) are used.
        // If there was an existing connected client, we should probably disconnect it first.
        self.streams.remove(&client_id);
        if let Some(old_client) = clients.get(&client_id) {
            let mut old_client = old_client.write().await;
            let _ = old_client.disconnect().await;
        }

        let client = ClaudeClient::new(options);
        clients.insert(client_id.clone(), Arc::new(RwLock::new(client)));

        // Store session metadata
        self.session_metadata.insert(
            client_id,
            SessionMetadata { permission_mode },
        );

        Ok(())
    }

    /// Moves a client to a new key, e.g. after `/clear` makes the CLI continue
    /// under a new session id. Permission hooks follow through the shared id arc.
    pub async fn rename_client(&self, client_id: &str, new_id: &str) {
        if client_id == new_id {
            return;
        }
        let mut clients = self.clients.lock().await;
        let Some(client) = clients.remove(client_id) else {
            return;
        };
        clients.insert(new_id.to_string(), client);
        if let Some((_, meta)) = self.session_metadata.remove(client_id) {
            self.session_metadata.insert(new_id.to_string(), meta);
        }
        if let Some((_, stream)) = self.streams.remove(client_id) {
            self.streams.insert(new_id.to_string(), stream);
        }
        if let Some((_, arc)) = self.session_arcs.remove(client_id) {
            *arc.lock().unwrap() = new_id.to_string();
            self.session_arcs.insert(new_id.to_string(), arc);
        }
    }

    pub async fn remove_client(&self, client_id: &str) -> Result<(), String> {
        // Unregister the reader first: a CLI that exits because it was closed
        // is not reported as a failed turn.
        self.streams.remove(client_id);
        let mut clients = self.clients.lock().await;
        if let Some(client) = clients.remove(client_id) {
            let mut client = client.write().await;
            client.disconnect().await.map_err(|e| e.to_string())?;
        }
        self.session_metadata.remove(client_id);
        self.session_arcs.remove(client_id);
        Ok(())
    }

    pub fn get_permission_mode(&self, session_id: &str) -> Option<String> {
        self.session_metadata.get(session_id).and_then(|m| m.permission_mode.clone())
    }

    pub fn set_permission_mode(&self, session_id: &str, mode: String) {
        if let Some(mut meta) = self.session_metadata.get_mut(session_id) {
            meta.permission_mode = Some(mode);
        }
    }

    pub fn resolve_permission(&self, request_id: &str, decision: String) -> Result<(), String> {
        if let Some((_, tx)) = self.pending_permissions.remove(request_id) {
            let _ = tx.send(decision);
            Ok(())
        } else {
            Err(format!("Permission request not found: {}", request_id))
        }
    }
}

impl Default for CCState {
    fn default() -> Self {
        Self::new(Arc::new(NoOpSink))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn rename_client_moves_client_metadata_and_hook_id() {
        let state = CCState::default();
        state
            .create_client("old".to_string(), ClaudeAgentOptions::default(), Some("plan".to_string()))
            .await
            .unwrap();
        let arc = Arc::new(Mutex::new("old".to_string()));
        state.session_arcs.insert("old".to_string(), Arc::clone(&arc));

        state.rename_client("old", "new").await;

        assert!(state.get_client("old").await.is_none());
        assert!(state.get_client("new").await.is_some());
        assert_eq!(state.get_permission_mode("new").as_deref(), Some("plan"));
        assert!(state.get_permission_mode("old").is_none());
        // Permission hooks hold the arc and now report the new id.
        assert_eq!(arc.lock().unwrap().as_str(), "new");
        assert!(state.session_arcs.contains_key("new"));
    }
}
