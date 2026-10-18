import {
  type AcpSessionRecord,
  acpGetSession,
  acpLoadSession,
  acpNewSession,
  acpStart,
} from '@/services/apiAdapt/acp';
import { useWorkspaceStore } from '@/stores';
import { useAcpStore } from '@/stores/useAcpStore';
import { applyAcpUpdate } from './applyUpdate';
import { detachBotConnection } from './botConnection';

/**
 * Open a stored session in the chat pane. Agents that advertise `loadSession`
 * get a real resume; for the others the transcript is replayed locally as
 * history and the next prompt starts a fresh agent-side session. Throws when
 * the agent cannot be started or the session cannot be loaded.
 */
export async function openAcpSession(record: AcpSessionRecord) {
  // A bot's process would record this session as the bot's.
  detachBotConnection();
  const store = useAcpStore.getState();
  useWorkspaceStore.getState().setCwd(record.cwd);

  let connectionId = store.connectionId;
  let canLoadSession = store.canLoadSession;
  // Whether the connection was spawned right here, in which case it already
  // carries a fresh session from `session/new`.
  let startedFresh = false;

  // Only a different agent (or no live process) needs its own connection: cwd
  // is a session-level parameter, so the running process can serve a session
  // in another project too.
  if (!connectionId || store.agentId !== record.agentId) {
    const res = await acpStart(record.agentId, record.cwd);
    connectionId = res.connectionId;
    canLoadSession = res.initialize.agentCapabilities?.loadSession === true;
    store.setAgentId(record.agentId);
    store.setConnection({
      connectionId: res.connectionId,
      sessionId: res.sessionId,
      agentTitle:
        res.initialize.agentInfo?.title ?? res.initialize.agentInfo?.name ?? record.agentId,
      authMethods: res.initialize.authMethods ?? [],
      canLoadSession,
      canAttachImages: res.initialize.agentCapabilities?.promptCapabilities?.image === true,
    });
    store.applySession(res.session);
    startedFresh = true;
  }

  store.setEntries([]);

  if (canLoadSession) {
    // The agent replays the transcript as live `session/update` events, so the
    // pane must already point at this session or the replay is filtered out as
    // belonging to another one.
    store.setSessionId(record.sessionId);
    const session = await acpLoadSession(connectionId, record.sessionId, record.cwd);
    store.applySession({ ...session, sessionId: record.sessionId });
  } else {
    // The agent cannot resume this session, so the stored transcript is shown
    // as history only. The next prompt needs a session the agent process
    // actually knows — reuse the one it was just started with, else open a new
    // one, so prompts do not target the dead id.
    if (!startedFresh) {
      store.applySession(await acpNewSession(connectionId, record.cwd));
    }
    for (const update of await acpGetSession(record.sessionId)) {
      applyAcpUpdate(update as Record<string, any>);
    }
  }
}
