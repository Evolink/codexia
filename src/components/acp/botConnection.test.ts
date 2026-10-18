import { beforeEach, describe, expect, it } from 'vitest';
import { useAcpStore } from '@/stores/useAcpStore';
import { useBotUiStore } from '@/stores/useBotUiStore';
import { detachBotConnection, isBotConnection } from './botConnection';

describe('botConnection', () => {
  beforeEach(() => {
    useAcpStore.getState().reset();
    useAcpStore.setState({ active: true, agentId: 'keke' });
    useBotUiStore.setState({ connectionByBot: { brief: 'bot-conn' } });
  });

  it('tells a bot process from a chat process', () => {
    expect(isBotConnection('bot-conn')).toBe(true);
    expect(isBotConnection('chat-conn')).toBe(false);
    expect(isBotConnection(null)).toBe(false);
  });

  // A bot shares the `keke` agent id with an ordinary chat; carrying its
  // connection into the chat pane made every session opened there the bot's.
  it('lets the chat pane go of a bot connection and asks for a fresh one', () => {
    useAcpStore.setState({ connectionId: 'bot-conn', sessionId: 'bot-session' });
    const nonce = useAcpStore.getState().restartNonce;

    expect(detachBotConnection()).toBe(true);

    const store = useAcpStore.getState();
    expect(store.connectionId).toBeNull();
    expect(store.sessionId).toBeNull();
    expect(store.agentId).toBe('keke');
    expect(store.active).toBe(true);
    expect(store.restartNonce).toBe(nonce + 1);
    // The bot keeps its process.
    expect(useBotUiStore.getState().connectionByBot).toEqual({ brief: 'bot-conn' });
  });

  it('leaves a chat connection alone', () => {
    useAcpStore.setState({ connectionId: 'chat-conn', sessionId: 's1' });

    expect(detachBotConnection()).toBe(false);
    expect(useAcpStore.getState().connectionId).toBe('chat-conn');
  });
});
