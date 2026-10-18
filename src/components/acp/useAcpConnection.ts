import { useCallback, useEffect, useRef } from 'react';
import { toast } from '@/components/ui/use-toast';
import { acpListSessions, acpStart } from '@/services/apiAdapt/acp';
import { useWorkspaceStore } from '@/stores';
import { useAcpStore } from '@/stores/useAcpStore';
import { captureBotOptions } from '@/stores/useBotOptionsStore';
import { openAcpSession } from './openSession';
import { useAcpAgents } from './useAcpAgents';

/**
 * The pane's agent connection: connects as soon as an installed agent is
 * picked — reopening the session from before a reload when there is one — and
 * exposes `connect` for a send that finds no live session.
 */
export function useAcpConnection() {
  const {
    agentId,
    connectionId,
    connecting,
    setConnecting,
    setConnection,
    applySession,
    addEntry,
    restartNonce,
  } = useAcpStore();
  const cwd = useWorkspaceStore((s) => s.cwd);
  const agents = useAcpAgents() ?? [];
  // Agent we already tried to auto-connect, so a failed start does not spin in
  // a retry loop. Cleared on an explicit restart.
  const attempted = useRef<string | null>(null);
  const seenRestart = useRef(restartNonce);

  const agent = agents.find((a) => a.id === agentId);
  /** Start the agent and open a session. Returns the live ids, or null on failure. */
  const connect = useCallback(async () => {
    if (!cwd) {
      toast({ title: 'Pick a workspace folder first', variant: 'destructive' });
      return null;
    }
    attempted.current = agentId;
    setConnecting(true);
    try {
      const res = await acpStart(agentId, cwd);
      setConnection({
        connectionId: res.connectionId,
        sessionId: res.sessionId,
        agentTitle: res.initialize.agentInfo?.title ?? res.initialize.agentInfo?.name ?? agentId,
        authMethods: res.initialize.authMethods ?? [],
        canLoadSession: res.initialize.agentCapabilities?.loadSession === true,
        canAttachImages: res.initialize.agentCapabilities?.promptCapabilities?.image === true,
      });
      applySession(res.session);
      // keke's own catalogue also configures bots, which are keke processes —
      // so a bot can be set up from this session without opening its chat.
      if (agentId === 'keke') captureBotOptions('', res.initialize, res.session);
      if (res.sessionError) {
        addEntry({ id: `start-${Date.now()}`, role: 'error', text: res.sessionError });
        return null;
      }
      return res.sessionId ? { connectionId: res.connectionId, sessionId: res.sessionId } : null;
    } catch (e) {
      setConnecting(false);
      toast({ title: 'Failed to start agent', description: String(e), variant: 'destructive' });
      return null;
    }
  }, [agentId, cwd, setConnecting, setConnection, applySession, addEntry]);

  /**
   * Reopen the session the pane showed before a reload, else start fresh. Only
   * a chat session of this agent in this project qualifies: a bot's session
   * must stay on the bot's own process.
   */
  const resumeOrConnect = useCallback(async () => {
    const { resumeSessionId, setResumeSessionId } = useAcpStore.getState();
    if (!resumeSessionId || !cwd) return connect();
    attempted.current = agentId;
    setConnecting(true);
    try {
      const record = (await acpListSessions(cwd)).find(
        (r) => r.sessionId === resumeSessionId && r.agentId === agentId && !r.botId
      );
      if (record) {
        await openAcpSession(record);
        return;
      }
    } catch (e) {
      console.error('acp: failed to resume the last session', e);
    } finally {
      setResumeSessionId(null);
      setConnecting(false);
    }
    // A half-opened resume may have left a process behind; reuse it.
    if (!useAcpStore.getState().connectionId) return connect();
  }, [agentId, cwd, connect, setConnecting]);

  // Connect as soon as an installed agent is picked, so its model / mode
  // controls are available before the first prompt.
  useEffect(() => {
    if (seenRestart.current !== restartNonce) {
      seenRestart.current = restartNonce;
      attempted.current = null;
    }
    if (connectionId || connecting || !cwd || !agent?.available) return;
    if (attempted.current === agentId) return;
    void resumeOrConnect();
  }, [agentId, cwd, connectionId, connecting, agent?.available, restartNonce, resumeOrConnect]);

  return { agent, connect };
}
