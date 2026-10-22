//! Generic Agent Client Protocol (ACP) client.
//!
//! Speaks JSON-RPC 2.0 over a child process' stdio, so any ACP-capable agent
//! (Gemini CLI, Hermes, Claude Code ACP, ...) can be driven from one UI.
//! Sessions are recorded through an injected `SessionStore`; bots live in
//! `codexia-bots` and plug in through [`BotHooks`].

pub mod agents;
pub mod client;
pub mod delegation;
pub mod mcp;
pub mod state;

pub use agents::{AcpAgentDef, find_preset, install_preset, list_agents};
pub use client::{ACP_EVENT, AcpClient, ConnectionPolicy, UnattendedApprovals, WaitClock};
pub use state::{AcpStartResult, AcpState, BotHooks};
