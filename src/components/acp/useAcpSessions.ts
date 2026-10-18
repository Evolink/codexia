import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { type AcpSessionRecord, acpDeleteSession, acpListSessions } from '@/services/apiAdapt/acp';
import { useWorkspaceStore } from '@/stores';
import { useAcpStore } from '@/stores/useAcpStore';
import { acpFreshSession } from './newSession';
import { openAcpSession } from './openSession';

/**
 * The persisted ACP sessions of one project directory, plus the actions the
 * sidebar needs. Sessions are stored by the backend as they run: ACP has no
 * listing RPC of its own.
 */
export function useAcpSessions(directory: string) {
  const { sessionId, entries } = useAcpStore();
  const [sessions, setSessions] = useState<AcpSessionRecord[]>([]);
  const [opening, setOpening] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!directory) return;
    try {
      setSessions(await acpListSessions(directory));
    } catch (e) {
      console.error('acp: failed to list sessions', e);
    }
  }, [directory]);

  // Re-list when the workspace changes, and after a turn lands in the store so
  // a new session shows up with its title.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate re-list triggers, not values refresh reads
  useEffect(() => {
    void refresh();
  }, [refresh, sessionId, entries.length]);

  const open = useCallback(async (record: AcpSessionRecord) => {
    setOpening(record.sessionId);
    try {
      await openAcpSession(record);
    } catch (e) {
      toast({ title: 'Failed to open session', description: String(e), variant: 'destructive' });
    } finally {
      setOpening(null);
    }
  }, []);

  const remove = useCallback(
    async (record: AcpSessionRecord) => {
      await acpDeleteSession(record.sessionId);
      const store = useAcpStore.getState();
      if (store.sessionId === record.sessionId) {
        // Deleting the open session only needs another session on the same
        // process; restarting the agent is the fallback.
        const cwd = useWorkspaceStore.getState().cwd;
        const reused =
          store.connectionId && cwd ? await acpFreshSession(store.connectionId, cwd) : false;
        if (!reused) store.restart();
      }
      void refresh();
    },
    [refresh]
  );

  return { sessions, opening, refresh, open, remove };
}
