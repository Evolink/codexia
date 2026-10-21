import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CCMessage } from '@/components/cc/types/messages';
import { useCCStore } from '@/stores/cc';
import { useCCInputStore } from '@/stores/cc/useCCInputStore';
import { useAgentCenterStore } from '@/stores/useAgentCenterStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';

const forkSession = vi.fn();
vi.mock('@/services', () => ({
  ccForkSession: (...args: unknown[]) => forkSession(...args),
  ccGetSessionMessages: vi.fn(),
  ccNewSession: vi.fn(),
  ccResumeSession: vi.fn(),
  ccSendMessage: vi.fn(),
}));

import { useCCSessionManager } from './useCCSessionManager';

const first = { type: 'user', text: 'first' } as CCMessage;
const reply = { type: 'assistant', uuid: 'a1', message: { content: [] } } as CCMessage;
const second = { type: 'user', text: 'second' } as CCMessage;

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ cwd: '/project' });
  useCCInputStore.setState({ inputValue: '' });
  useCCStore.setState({
    activeSessionId: 's1',
    activeSessionIds: ['s1'],
    messages: [first, reply, second],
    sessionMessagesMap: { s1: [first, reply, second] },
  });
  useAgentCenterStore.setState({ cards: [{ kind: 'cc', id: 's1' }], currentAgentCardId: 's1' });
});

describe('handleEditPrompt', () => {
  it('moves the session to a branch that keeps the history before the prompt', async () => {
    forkSession.mockResolvedValue('fork');
    const { result } = renderHook(() => useCCSessionManager());

    await act(() =>
      result.current.handleEditPrompt('s1', { text: 'second', index: 2, forkAt: 'a1' })
    );

    expect(forkSession).toHaveBeenCalledWith(
      's1',
      'a1',
      expect.objectContaining({ cwd: '/project' })
    );
    const state = useCCStore.getState();
    expect(state.activeSessionId).toBe('fork');
    expect(state.messages).toEqual([first, reply]);
    expect(useAgentCenterStore.getState().cards[0].id).toBe('fork');
    expect(useCCInputStore.getState().inputValue).toBe('second');
  });

  it('keeps the session when branching fails', async () => {
    forkSession.mockRejectedValue(new Error('Resume rejected'));
    const { result } = renderHook(() => useCCSessionManager());

    await act(() =>
      result.current.handleEditPrompt('s1', { text: 'second', index: 2, forkAt: 'a1' })
    );

    expect(useCCStore.getState().activeSessionId).toBe('s1');
    expect(useCCStore.getState().messages).toHaveLength(3);
    expect(useCCInputStore.getState().inputValue).toBe('');
  });
});
