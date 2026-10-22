import { acpGetSession } from '@/services/apiAdapt/acp';
import { useAcpStore } from '@/stores/useAcpStore';

/**
 * Pick up the slash commands a session advertised before the pane could place
 * them. Agents send `available_commands_update` right around `session/new` —
 * keke before even answering it — while the pane does not yet know the session
 * or listen to a new connection, so the live update is dropped. The backend
 * stores every update before forwarding it, so the last stored one is the
 * current list, and none stored means the session has no commands.
 */
export async function restoreAcpCommands(sessionId: string | null) {
  if (!sessionId) return;
  const updates = await acpGetSession(sessionId).catch(() => []);
  const store = useAcpStore.getState();
  if (store.sessionId !== sessionId) return;
  for (let i = updates.length - 1; i >= 0; i--) {
    const update = updates[i] as { sessionUpdate?: string; availableCommands?: unknown };
    if (update.sessionUpdate === 'available_commands_update') {
      store.setCommands((update.availableCommands as typeof store.commands) ?? []);
      return;
    }
  }
  store.setCommands([]);
}
