import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAgentCenterStore } from '@/stores';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useReviewCwd } from './useReviewCwd';

const WORKTREE = '/home/u/.codexia/worktrees/app-1/thread-1';

beforeEach(() => {
  useWorkspaceStore.setState({ cwd: '/work/app' });
  useAgentCenterStore.setState({
    cards: [
      { kind: 'codex', id: 'wt', worktreePath: WORKTREE, cwd: '/work/app' },
      { kind: 'cc', id: 'plain', cwd: '/work/app' },
    ],
    currentAgentCardId: null,
  });
});

describe('useReviewCwd', () => {
  it('reviews the project checkout when no thread is selected', () => {
    const { result } = renderHook(() => useReviewCwd());
    expect(result.current).toEqual({ cwd: '/work/app', inWorktree: false });
  });

  it('reviews the worktree of a thread that runs in one', () => {
    useAgentCenterStore.setState({ currentAgentCardId: 'wt' });
    const { result } = renderHook(() => useReviewCwd());
    expect(result.current).toEqual({ cwd: WORKTREE, inWorktree: true });
  });

  it('goes back to the project checkout once the worktree is applied', () => {
    useAgentCenterStore.setState({ currentAgentCardId: 'wt' });
    const { result, rerender } = renderHook(() => useReviewCwd());
    useAgentCenterStore.getState().updateCard({ kind: 'codex', id: 'wt', worktreePath: undefined });
    rerender();
    expect(result.current.inWorktree).toBe(false);
  });

  it('ignores a selected thread without a worktree', () => {
    useAgentCenterStore.setState({ currentAgentCardId: 'plain' });
    const { result } = renderHook(() => useReviewCwd());
    expect(result.current.cwd).toBe('/work/app');
  });
});
