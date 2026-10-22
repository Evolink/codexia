use std::sync::Arc;
use std::sync::OnceLock;

use codexia_shared::event_sink::EventSink;
use codexia_shared::session_store::SessionStore;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use async_trait::async_trait;

use crate::agents::{AcpAgentDef, find_preset};
use crate::client::{AcpClient, ConnectionPolicy};

/// Result of starting an agent: everything the UI needs to render the session.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpStartResult {
    pub connection_id: String,
    pub session_id: Option<String>,
    /// Raw `initialize` response (agentInfo, authMethods, agentCapabilities).
    pub initialize: Value,
    /// Raw `session/new` result: `modes`, `models`, `configOptions`.
    pub session: Option<Value>,
    /// Set when `session/new` failed, e.g. because the agent needs auth.
    pub session_error: Option<String>,
}

impl AcpStartResult {
    /// Shape the outcome of opening the first session on a fresh connection.
    pub fn new(connection_id: String, initialize: Value, opened: Result<Value, String>) -> Self {
        let (session, session_error) = match opened {
            Ok(session) => (Some(session), None),
            Err(e) => (None, Some(e)),
        };
        let session_id = session
            .as_ref()
            .and_then(|s| s.get("sessionId"))
            .and_then(Value::as_str)
            .map(str::to_string);
        Self { connection_id, session_id, initialize, session, session_error }
    }
}

/// What a connection started for a bot needs from `codexia-bots`: how to
/// launch it, and what to apply to each session it opens. Installed once with
/// [`AcpState::set_bot_hooks`]; without it, starting a bot fails.
// `async_trait` boxes each future, which clippy 1.99 flags as `double_must_use`.
#[allow(clippy::double_must_use)]
#[async_trait]
pub trait BotHooks: Send + Sync {
    /// Start a connection for `bot_id` and open its first session in `cwd`
    /// (the bot's own folder when empty).
    async fn start(&self, acp: &AcpState, bot_id: &str, cwd: &str) -> Result<AcpStartResult, String>;

    /// A session was just opened or resumed on a bot's connection.
    async fn session_opened(&self, client: &AcpClient, session_id: &str);

    /// The folder a bot works in when no project is given.
    fn work_dir(&self, bot_id: &str) -> Result<String, String>;
}

#[derive(Clone)]
pub struct AcpState {
    connections: Arc<DashMap<String, Arc<AcpClient>>>,
    sink: Arc<dyn EventSink>,
    store: Arc<dyn SessionStore>,
    bot_hooks: Arc<OnceLock<Arc<dyn BotHooks>>>,
}

impl AcpState {
    pub fn new(sink: Arc<dyn EventSink>, store: Arc<dyn SessionStore>) -> Self {
        Self {
            connections: Arc::new(DashMap::new()),
            sink,
            store,
            bot_hooks: Arc::new(OnceLock::new()),
        }
    }

    /// Install what bots need; the first installation wins.
    pub fn set_bot_hooks(&self, hooks: Arc<dyn BotHooks>) {
        let _ = self.bot_hooks.set(hooks);
    }

    fn bot_hooks(&self) -> Result<&Arc<dyn BotHooks>, String> {
        self.bot_hooks.get().ok_or_else(|| "bots are not set up".to_string())
    }

    pub fn sink(&self) -> Arc<dyn EventSink> {
        self.sink.clone()
    }

    /// Every running connection.
    pub fn connections(&self) -> impl Iterator<Item = Arc<AcpClient>> + '_ {
        self.connections.iter().map(|c| c.value().clone())
    }

    /// Spawn `agent` in `cwd`, run the handshake and keep the connection
    /// under `connection_id`. No session is opened yet.
    pub async fn connect(
        &self,
        connection_id: String,
        agent: &AcpAgentDef,
        cwd: &str,
        bot_id: Option<String>,
        policy: ConnectionPolicy,
    ) -> Result<(Arc<AcpClient>, Value), String> {
        let (client, initialize) = AcpClient::spawn(
            connection_id.clone(),
            agent,
            Some(cwd),
            bot_id,
            policy,
            self.sink.clone(),
            self.store.clone(),
        )
        .await?;
        self.connections.insert(connection_id, client.clone());
        Ok((client, initialize))
    }

    /// Spawn `agent_id` (a preset id, or a custom definition) and open a session in `cwd`.
    /// A `bot_id` hands the launch to the installed [`BotHooks`], so what the
    /// Bot tab runs and what a routine runs cannot drift apart.
    pub async fn start(
        &self,
        agent_id: &str,
        cwd: &str,
        custom: Option<AcpAgentDef>,
        bot_id: Option<String>,
    ) -> Result<AcpStartResult, String> {
        if let Some(bot_id) = bot_id {
            return self.bot_hooks()?.start(self, &bot_id, cwd).await;
        }
        let agent = match custom {
            Some(agent) => agent,
            None => find_preset(agent_id).ok_or_else(|| format!("unknown ACP agent: {agent_id}"))?,
        };
        // An empty `cwd` makes the spawn fail with ENOENT.
        let cwd = if cwd.is_empty() { home_dir("start the agent in")? } else { cwd.to_string() };

        let connection_id = uuid::Uuid::new_v4().to_string();
        let (client, initialize) = self
            .connect(connection_id.clone(), &agent, &cwd, None, ConnectionPolicy::default())
            .await?;
        let opened = client.new_session(&cwd).await;
        Ok(AcpStartResult::new(connection_id, initialize, opened))
    }

    fn get(&self, connection_id: &str) -> Result<Arc<AcpClient>, String> {
        self.connections
            .get(connection_id)
            .map(|c| c.clone())
            .ok_or_else(|| format!("unknown ACP connection: {connection_id}"))
    }

    pub async fn prompt(
        &self,
        connection_id: &str,
        session_id: Option<&str>,
        text: &str,
        images: &[String],
    ) -> Result<Value, String> {
        let client = self.get(connection_id)?;
        // A bot turn keeps the computer awake until it ends, like an
        // unattended run; other ACP agents are covered by the frontend's own
        // per-task setting.
        let _awake = client
            .bot_id
            .as_ref()
            .map(|_| codexia_shared::sleep::KeepAwake::hold(format!("bot-turn-{connection_id}")));
        client.prompt(session_id, text, images).await
    }

    /// Unattended bot requests waiting for a person, across every running
    /// connection, optionally only for one bot. Oldest first.
    pub fn waiting_approvals(&self, bot_id: Option<&str>) -> Vec<Value> {
        let mut waiting: Vec<Value> = self
            .connections
            .iter()
            .filter(|c| bot_id.is_none() || c.value().bot_id.as_deref() == bot_id)
            .flat_map(|c| c.value().waiting_requests())
            .collect();
        waiting.sort_by(|a, b| {
            a["requestedAt"].as_str().unwrap_or_default().cmp(b["requestedAt"].as_str().unwrap_or_default())
        });
        waiting
    }

    pub async fn cancel(
        &self,
        connection_id: &str,
        session_id: Option<&str>,
    ) -> Result<(), String> {
        self.get(connection_id)?.cancel(session_id).await
    }

    pub async fn authenticate(
        &self,
        connection_id: &str,
        method_id: &str,
        remember: bool,
        api_key: Option<&str>,
    ) -> Result<(), String> {
        let client = self.get(connection_id)?;
        client.authenticate_with(method_id, remember, api_key).await
    }

    /// The folder a session opens in: `cwd`, or a bot's own folder when the
    /// bot has no project, or the home folder; the same fallback [`AcpState::start`] uses.
    fn session_cwd(&self, client: &AcpClient, cwd: &str) -> Result<String, String> {
        if !cwd.is_empty() {
            return Ok(cwd.to_string());
        }
        match client.bot_id.as_deref() {
            Some(bot_id) => self.bot_hooks()?.work_dir(bot_id),
            None => home_dir("open the session in"),
        }
    }

    /// Open a session on a connection that had to authenticate first.
    pub async fn new_session(&self, connection_id: &str, cwd: &str) -> Result<Value, String> {
        let client = self.get(connection_id)?;
        let cwd = self.session_cwd(&client, cwd)?;
        let session = client.new_session(&cwd).await?;
        if let Some(session_id) = session.get("sessionId").and_then(Value::as_str) {
            self.apply_bot_settings(&client, session_id).await;
        }
        Ok(session)
    }

    /// A bot's settings belong on every session its process opens or resumes,
    /// not only the first one.
    async fn apply_bot_settings(&self, client: &AcpClient, session_id: &str) {
        if client.bot_id.is_none() {
            return;
        }
        if let Ok(hooks) = self.bot_hooks() {
            hooks.session_opened(client, session_id).await;
        }
    }

    /// Resume a stored session on a live connection. Fails for agents that do
    /// not advertise `agentCapabilities.loadSession`.
    pub async fn load_session(
        &self,
        connection_id: &str,
        session_id: &str,
        cwd: &str,
    ) -> Result<Value, String> {
        let client = self.get(connection_id)?;
        let session = client.load_session(session_id, cwd).await?;
        self.apply_bot_settings(&client, session_id).await;
        Ok(session)
    }

    pub async fn set_mode(
        &self,
        connection_id: &str,
        session_id: Option<&str>,
        mode_id: &str,
    ) -> Result<Value, String> {
        self.get(connection_id)?.set_mode(session_id, mode_id).await
    }

    pub async fn set_model(
        &self,
        connection_id: &str,
        session_id: Option<&str>,
        model_id: &str,
        reasoning_effort: Option<&str>,
    ) -> Result<Value, String> {
        self.get(connection_id)?
            .set_model(session_id, model_id, reasoning_effort)
            .await
    }

    pub async fn set_config_option(
        &self,
        connection_id: &str,
        session_id: Option<&str>,
        config_id: &str,
        value: &Value,
    ) -> Result<Value, String> {
        self.get(connection_id)?
            .set_config_option(session_id, config_id, value)
            .await
    }

    pub fn respond_permission(
        &self,
        connection_id: &str,
        request_id: &str,
        option_id: Option<String>,
    ) -> Result<(), String> {
        self.get(connection_id)?
            .respond_permission(request_id, option_id)
    }

    pub async fn stop(&self, connection_id: &str) -> Result<(), String> {
        if let Some((_, client)) = self.connections.remove(connection_id) {
            client.kill().await;
        }
        Ok(())
    }
}

fn home_dir(purpose: &str) -> Result<String, String> {
    Ok(dirs::home_dir()
        .ok_or_else(|| format!("no home directory to {purpose}"))?
        .to_string_lossy()
        .into_owned())
}
