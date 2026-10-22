/// Where an ACP client records the sessions it opens. The client only writes:
/// reading the list and the transcript back is the consumer's job, so the
/// storage behind this can change without touching the protocol code.
/// Implementations live in the consuming crates (`codexia-db` for SQLite).
pub trait SessionStore: Send + Sync {
    /// Record a session as soon as `session/new` or `session/load` succeeds.
    /// Re-recording an existing session must not change who owns it.
    fn record_session(
        &self,
        session_id: &str,
        agent_id: &str,
        agent_title: Option<&str>,
        cwd: &str,
        bot_id: Option<&str>,
    ) -> Result<(), String>;

    /// Append one raw `session/update` payload to the transcript. `touch`
    /// moves the session up the list; only conversation content should.
    fn append_update(&self, session_id: &str, payload: &str, touch: bool) -> Result<(), String>;

    /// Label the session, keeping the first label that was written.
    fn set_title_if_empty(&self, session_id: &str, title: &str) -> Result<(), String>;
}

/// A store that keeps nothing, for tests and callers that need no history.
pub struct NoSessionStore;

impl SessionStore for NoSessionStore {
    fn record_session(&self, _: &str, _: &str, _: Option<&str>, _: &str, _: Option<&str>) -> Result<(), String> {
        Ok(())
    }

    fn append_update(&self, _: &str, _: &str, _: bool) -> Result<(), String> {
        Ok(())
    }

    fn set_title_if_empty(&self, _: &str, _: &str) -> Result<(), String> {
        Ok(())
    }
}
