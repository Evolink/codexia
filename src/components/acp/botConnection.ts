import { useAcpStore } from '@/stores/useAcpStore';
import { useBotUiStore } from '@/stores/useBotUiStore';

/** Whether `connectionId` is a bot's own keke process. */
export function isBotConnection(connectionId: string | null): boolean {
  if (!connectionId) return false;
  return Object.values(useBotUiStore.getState().connectionByBot).includes(connectionId);
}

/**
 * Let the chat pane go of a bot's connection.
 *
 * Bots and chats share one ACP store, and a bot's process records every
 * session it opens as the bot's own — and prunes the bot's untitled sessions
 * as it does. A chat must never start or load a session on it. The bot keeps
 * its process; only the pane is cleared, and the composer connects afresh.
 * Returns whether anything was let go.
 */
export function detachBotConnection(): boolean {
  const store = useAcpStore.getState();
  if (!isBotConnection(store.connectionId)) return false;
  store.restart();
  return true;
}
