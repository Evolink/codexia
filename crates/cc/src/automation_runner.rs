//! Drives a Claude Code session on behalf of `codexia-automation`.

use async_trait::async_trait;
use claude_agent_sdk_rs::Message;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use uuid::Uuid;

use codexia_shared::agent_runner::{AgentRunOutcome, AgentRunSpec, AgentRunner};

use crate::services::{message_service, session_service};
use crate::{CCConnectParams, CCState};

/// How long a session must stay quiet, once its work is done, to count as idle.
const IDLE_QUIET: Duration = Duration::from_secs(2);
/// Longest wait for background work after the turn ends; a background shell
/// such as a dev server may never finish.
const MAX_BACKGROUND_WAIT: Duration = Duration::from_secs(15 * 60);

pub struct CcAgentRunner {
    cc_state: CCState,
}

impl CcAgentRunner {
    pub fn new(cc_state: CCState) -> Self {
        Self { cc_state }
    }
}

#[async_trait]
impl AgentRunner for CcAgentRunner {
    fn agent(&self) -> &'static str {
        "cc"
    }

    async fn start_run(&self, spec: AgentRunSpec) -> Result<AgentRunOutcome, String> {
        let session_id = Uuid::new_v4().to_string();
        let target_dir = match spec.cwd.as_ref() {
            Some(cwd) => cwd.clone(),
            None => std::env::current_dir()
                .map_err(|err| err.to_string())?
                .to_string_lossy()
                .to_string(),
        };

        session_service::connect(
            CCConnectParams {
                session_id: session_id.clone(),
                cwd: target_dir,
                model: if spec.model.trim().is_empty() {
                    None
                } else {
                    Some(spec.model.clone())
                },
                effort: None,
                permission_mode: Some("bypassPermissions".to_string()),
                resume_id: None,
            },
            &self.cc_state,
        )
        .await?;
        log::info!("[CC automation] Connected to Claude session {}", session_id);
        // The CLI runs under `session_id`, so the run is recorded under it right away.
        (spec.on_started)(session_id.as_str());

        // `/clear` in the prompt moves the client to a new key; disconnect that one.
        let final_key: Arc<Mutex<String>> = Arc::new(Mutex::new(session_id.clone()));
        let on_message = {
            let final_key = Arc::clone(&final_key);
            move |key: &str, _message: Message| {
                let mut slot = final_key.lock().unwrap();
                if slot.as_str() != key {
                    *slot = key.to_string();
                }
            }
        };

        log::info!("[CC automation] Sending prompt to session {}...", session_id);
        let result = message_service::send_message_and_wait(
            session_id.as_str(),
            spec.prompt.as_str(),
            &[],
            &self.cc_state,
            on_message,
        )
        .await;

        // Background agents keep working after the turn's result, and the CLI
        // reports their outcome in a turn of its own; closing now would stop them.
        if result.is_ok() {
            let key = final_key.lock().unwrap().clone();
            let idle = message_service::wait_until_idle(&key, &self.cc_state, IDLE_QUIET);
            if tokio::time::timeout(MAX_BACKGROUND_WAIT, idle).await.is_err() {
                log::warn!(
                    "[CC automation] session {} still busy after {:?}; closing it",
                    key,
                    MAX_BACKGROUND_WAIT
                );
            }
        }

        // A `/clear` turn moves the client; the id arc follows it.
        let final_key = {
            let key = final_key.lock().unwrap().clone();
            self.cc_state
                .session_arcs
                .get(&key)
                .map(|arc| arc.lock().unwrap().clone())
                .unwrap_or(key)
        };
        if let Err(err) = session_service::disconnect(final_key.as_str(), &self.cc_state).await {
            log::warn!(
                "failed to disconnect cc session {} for automation '{}': {}",
                final_key,
                spec.task_id,
                err
            );
        }

        result.map(|_| AgentRunOutcome::Finished)
    }
}
