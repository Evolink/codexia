import {
  type AcpSessionRecord,
  acpCancel,
  acpGetSession,
  acpLoadSession,
  acpNewSession,
  acpStart,
  acpStop,
} from '@/services/apiAdapt/acp';
import { useWorkspaceStore } from '@/stores';
import { useAcpStore } from '@/stores/useAcpStore';
import { applyAcpUpdate } from './applyUpdate';
import { detachBotConnection } from './botConnection';
import { restoreAcpCommands } from './restoreCommands';

/** Bumped by every open, so an earlier open still in flight knows it lost. */
let openGeneration = 0;

/**
 * Open a stored session in the chat pane. Agents that advertise `loadSession`
 * get a real resume; for the others the transcript is replayed locally as
 * history and the next prompt starts a fresh agent-side session. Throws when
 * the agent cannot be started or the session cannot be loaded.
 */
export async function openAcpSession(record: AcpSessionRecord) {
  const generation = ++openGeneration;
  const superseded = () => generation !== openGeneration;

  // A bot's process would record this session as the bot's.
  detachBotConnection();
  const store = useAcpStore.getState();
  // The previous turn keeps running in the agent otherwise — it is no longer
  // visible anywhere once the pane shows another session, and its prompt would
  // keep the composer busy.
  if (store.running && store.connectionId) {
    await acpCancel(store.connectionId, store.sessionId).catch(() => {});
    if (superseded()) return;
  }
  // `connecting` keeps the composer from sending and the pane from
  // auto-connecting a second process while this open is in flight.
  store.setConnecting(true);
  store.setRunning(false);
  store.setPermission(null);
  store.setEntries([]);
  useWorkspaceStore.getState().setCwd(record.cwd);

  try {
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
      if (superseded()) {
        // A later open owns the pane; do not leave this process orphaned.
        void acpStop(res.connectionId).catch(() => {});
        return;
      }
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
      store.setConnecting(true);
      store.applySession(res.session);
      startedFresh = true;
    }

    let resumed = false;
    if (canLoadSession) {
      // Point the pane at this session first, so live updates for it pass the
      // event bridge's session filter.
      store.setSessionId(record.sessionId);
      try {
        const session = await acpLoadSession(connectionId, record.sessionId, record.cwd);
        if (superseded()) return;
        store.applySession({ ...session, sessionId: record.sessionId });
        resumed = true;
      } catch (e) {
        if (superseded()) return;
        // The agent no longer has its own copy (Grok drops old sessions); the
        // stored transcript stays readable as history.
        console.warn('acp: session/load failed, showing history only', e);
      }
    }
    if (!resumed) {
      // The stored transcript is shown as history only. The next prompt needs a
      // session the agent process actually knows — reuse the one it was just
      // started with (unless a failed load replaced it), else open a new one, so
      // prompts do not target the dead id.
      if (!startedFresh || canLoadSession) {
        const session = await acpNewSession(connectionId, record.cwd);
        if (superseded()) return;
        store.applySession(session);
      }
    }

    // The transcript always comes from storage. A `session/load` replays it as
    // live events too, but a freshly started connection's event stream is only
    // subscribed after the pane re-renders — after the replay may already have
    // gone by — so the bridge drops replayed transcript events instead.
    const updates = await acpGetSession(record.sessionId);
    if (superseded()) return;
    store.setEntries([]);
    for (const update of updates) {
      applyAcpUpdate(update as Record<string, any>);
    }
    // History-only: the stored transcript carried the old session's command
    // list; the composer talks to the fresh session, so use its own.
    if (!resumed) await restoreAcpCommands(useAcpStore.getState().sessionId);
    if (superseded()) return;
    if (canLoadSession && !resumed) {
      store.addEntry({
        id: `resume-${Date.now()}`,
        role: 'error',
        text: 'The agent could not resume this session. New messages start a fresh one.',
      });
    }
  } finally {
    if (!superseded()) store.setConnecting(false);
  }
}
