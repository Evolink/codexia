import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const git = vi.hoisted(() => ({
  gitApplyWorktreeChanges: vi.fn(),
  gitCommit: vi.fn(),
  gitHasWorktreeChanges: vi.fn(),
  gitPush: vi.fn(),
  gitRemoveWorktree: vi.fn(),
  isGitRepo: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/services/apiAdapt/git', () => git);

import { useCodexStore } from '@/components/codex/stores';
import { useAgentCenterStore } from '@/stores';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { GitActions } from './GitActions';

const WORKTREE = '/work/app/.codexia/worktrees/wt-1';

beforeEach(() => {
  vi.clearAllMocks();
  git.gitHasWorktreeChanges.mockResolvedValue({ has_changes: true });
  git.gitApplyWorktreeChanges.mockResolvedValue({ changed_files: 2 });
  git.gitRemoveWorktree.mockResolvedValue(undefined);
  useWorkspaceStore.setState({ cwd: '/work/app' });
  useCodexStore.setState({ threadStatusMap: { t1: { type: 'idle' } } } as never);
  useAgentCenterStore.setState({
    cards: [{ kind: 'codex', id: 't1', preview: 'x', worktreePath: WORKTREE, cwd: '/work/app' }],
    currentAgentCardId: 't1',
  });
});

async function openMenu() {
  fireEvent.pointerDown(screen.getByTitle('Git Actions'), { button: 0, ctrlKey: false });
}

describe('GitActions worktree', () => {
  it('applies worktree changes, removes the worktree and detaches it from the card', async () => {
    render(<GitActions />);
    await waitFor(() => expect(git.gitHasWorktreeChanges).toHaveBeenCalledWith('/work/app', 'wt-1'));
    await openMenu();
    fireEvent.click(await screen.findByText('Apply to main checkout'));

    await waitFor(() => expect(git.gitRemoveWorktree).toHaveBeenCalledWith('/work/app', 'wt-1'));
    expect(git.gitApplyWorktreeChanges).toHaveBeenCalledWith('/work/app', 'wt-1');
    expect(useAgentCenterStore.getState().cards[0].worktreePath).toBeUndefined();
  });

  it('hides worktree actions for a thread without a worktree', async () => {
    useAgentCenterStore.setState({
      cards: [{ kind: 'codex', id: 't1', preview: 'x', cwd: '/work/app' }],
    });
    render(<GitActions />);
    await openMenu();
    await screen.findByText('Commit');
    expect(screen.queryByText('Apply to main checkout')).toBeNull();
    expect(screen.queryByText('Discard worktree')).toBeNull();
  });

  it('asks before discarding a worktree', async () => {
    render(<GitActions />);
    await openMenu();
    fireEvent.click(await screen.findByText('Discard worktree'));
    expect(git.gitRemoveWorktree).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(git.gitRemoveWorktree).toHaveBeenCalledWith('/work/app', 'wt-1'));
  });

  it('disables Commit and Push while reviewing a worktree', async () => {
    render(<GitActions />);
    await openMenu();
    const commit = await screen.findByRole('menuitem', { name: 'Commit' });
    expect(commit.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('menuitem', { name: 'Push' }).getAttribute('aria-disabled')).toBe(
      'true'
    );
  });

  it('keeps Commit and Push for a thread in the main checkout', async () => {
    useAgentCenterStore.setState({
      cards: [{ kind: 'codex', id: 't1', preview: 'x', cwd: '/work/app' }],
    });
    render(<GitActions />);
    await openMenu();
    const commit = await screen.findByRole('menuitem', { name: 'Commit' });
    expect(commit.getAttribute('aria-disabled')).toBeNull();
  });
});
