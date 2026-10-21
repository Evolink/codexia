import { beforeEach, describe, expect, it } from 'vitest';
import type { CCMessage } from '@/components/cc/types/messages';
import { useCCStore } from './ccStore';

const userMessage = { type: 'user', text: '/clear' } as CCMessage;

describe('renameSession', () => {
  beforeEach(() =>
    useCCStore.setState({
      activeSessionId: 'old',
      activeSessionIds: ['other', 'old'],
      messages: [userMessage],
      sessionMessagesMap: { old: [userMessage], other: [userMessage] },
      sessionLoadingMap: { old: false },
      sessionStartTimeMap: {},
      pendingNewSession: { session_id: 'old', summary: 'hi', last_modified: 1, cwd: '/p' },
    })
  );

  it('moves the session to the new id with an empty transcript', () => {
    useCCStore.getState().renameSession('old', 'new');
    const state = useCCStore.getState();
    expect(state.activeSessionId).toBe('new');
    expect(state.activeSessionIds).toEqual(['other', 'new']);
    expect(state.messages).toEqual([]);
    expect(state.sessionMessagesMap).toEqual({ other: [userMessage], new: [] });
    expect(state.sessionLoadingMap).toEqual({ new: false });
    expect(state.pendingNewSession?.session_id).toBe('new');
  });

  it('keeps the active transcript when renaming a background session', () => {
    useCCStore.setState({ activeSessionId: 'other' });
    useCCStore.getState().renameSession('old', 'new');
    const state = useCCStore.getState();
    expect(state.activeSessionId).toBe('other');
    expect(state.messages).toEqual([userMessage]);
    expect(state.sessionMessagesMap.new).toEqual([]);
  });

  it('ignores an unknown session', () => {
    const before = useCCStore.getState();
    useCCStore.getState().renameSession('missing', 'new');
    expect(useCCStore.getState().sessionMessagesMap).toBe(before.sessionMessagesMap);
  });
});
