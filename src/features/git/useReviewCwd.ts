import { useAgentCenterStore } from '@/stores';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';

/**
 * The checkout the Review tab shows. A thread running in a Codexia worktree keeps
 * its changes there until they are applied, so reviewing the main checkout would
 * show nothing for it.
 */
export function useReviewCwd(): { cwd: string | null; inWorktree: boolean } {
  const workspaceCwd = useWorkspaceStore((s) => s.cwd);
  const worktreePath = useAgentCenterStore(
    (s) => s.cards.find((c) => c.id === s.currentAgentCardId)?.worktreePath
  );
  return worktreePath
    ? { cwd: worktreePath, inWorktree: true }
    : { cwd: workspaceCwd, inWorktree: false };
}
