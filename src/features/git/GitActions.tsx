import { Check, CloudUpload, GitCommit, ListTodo, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useCodexStore } from '@/components/codex/stores';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import {
  gitApplyWorktreeChanges,
  gitCommit,
  gitHasWorktreeChanges,
  gitPush,
  gitRemoveWorktree,
} from '@/services/apiAdapt/git';
import { useAgentCenterStore } from '@/stores';
import { useCCStore } from '@/stores/cc';
import { useGitStatsStore } from '@/stores/useGitStatsStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { GitCommitDialog } from './GitCommitDialog';

/** Worktree of the thread being viewed, if it runs in one. */
function useCurrentWorktree(cwd: string | null) {
  const card = useAgentCenterStore((s) => s.cards.find((c) => c.id === s.currentAgentCardId));
  const updateCard = useAgentCenterStore((s) => s.updateCard);
  const busy = useCodexStore((s) =>
    card?.kind === 'codex' ? s.threadStatusMap[card.id]?.type === 'active' : false
  );
  const ccBusy = useCCStore((s) => (card?.kind === 'cc' ? !!s.sessionLoadingMap[card.id] : false));
  const key = card?.worktreePath?.split('/').pop() ?? '';
  const [hasChanges, setHasChanges] = useState(false);

  // Re-check when a running turn finishes, since that is when files change.
  const working = busy || ccBusy;
  useEffect(() => {
    if (!cwd || !key || working) {
      setHasChanges(false);
      return;
    }
    let cancelled = false;
    gitHasWorktreeChanges(cwd, key)
      .then((result) => !cancelled && setHasChanges(result.has_changes))
      .catch(() => !cancelled && setHasChanges(false));
    return () => {
      cancelled = true;
    };
  }, [cwd, key, working]);

  const detach = () => card && updateCard({ ...card, worktreePath: undefined });
  return { key, hasChanges, working, detach };
}

export function GitActions() {
  const { cwd } = useWorkspaceStore();
  const { refreshStats } = useGitStatsStore();
  const { toast } = useToast();
  const worktree = useCurrentWorktree(cwd);

  const [isCommitDialogOpen, setIsCommitDialogOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const applyWorktree = async () => {
    if (!cwd || !worktree.key) return;
    try {
      const result = await gitApplyWorktreeChanges(cwd, worktree.key);
      await gitRemoveWorktree(cwd, worktree.key);
      worktree.detach();
      refreshGitStats();
      toast.success('Applied worktree changes', {
        description: `${result.changed_files} file${result.changed_files === 1 ? '' : 's'} merged into the main checkout`,
      });
    } catch (err) {
      toast.error('Failed to apply worktree changes', { description: String(err) });
    }
  };

  const discardWorktree = async () => {
    if (!cwd || !worktree.key) return;
    try {
      await gitRemoveWorktree(cwd, worktree.key);
      worktree.detach();
      toast.success('Worktree discarded');
    } catch (err) {
      toast.error('Failed to discard worktree', { description: String(err) });
    }
  };

  const refreshGitStats = useCallback(() => {
    if (!cwd) return;
    void refreshStats(cwd);
  }, [cwd, refreshStats]);

  const confirmGitCommit = async (message: string) => {
    if (!cwd) return;
    try {
      await gitCommit(cwd, message);
      refreshGitStats();
      toast.success('Commit successful', {
        description: `Successfully committed: "${message}"`,
      });
    } catch (err) {
      toast.error('Commit failed', { description: String(err) });
      throw err;
    }
  };

  const handleGitPush = async () => {
    if (!cwd) return;
    try {
      await gitPush(cwd);
      toast.success('Push successful', { description: 'Successfully pushed to remote' });
    } catch (err) {
      console.error('Push failed:', err);
      toast.error('Push failed', { description: String(err) });
    }
  };

  if (!cwd) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg hover:bg-accent"
            title="Git Actions"
          >
            <ListTodo className="size-4 text-muted-foreground hover:text-foreground transition-colors" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-44 p-1">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground px-2 py-1.5">
            Git Actions
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="gap-2 text-xs cursor-pointer"
            onClick={() => setIsCommitDialogOpen(true)}
          >
            <GitCommit className="size-3.5 text-primary" />
            <span>Commit</span>
          </DropdownMenuItem>

          <DropdownMenuItem className="gap-2 text-xs cursor-pointer" onClick={handleGitPush}>
            <CloudUpload className="size-3.5 text-primary" />
            <span>Push</span>
          </DropdownMenuItem>

          {worktree.key && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 text-xs cursor-pointer"
                disabled={!worktree.hasChanges || worktree.working}
                onClick={applyWorktree}
              >
                <Check className="size-3.5 text-primary" />
                <span>Apply to main checkout</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 text-xs cursor-pointer text-destructive"
                disabled={worktree.working}
                onClick={() => setDiscardOpen(true)}
              >
                <Trash2 className="size-3.5" />
                <span>Discard worktree</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <GitCommitDialog
        isOpen={isCommitDialogOpen}
        onClose={() => setIsCommitDialogOpen(false)}
        onConfirm={confirmGitCommit}
      />

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this worktree?</AlertDialogTitle>
            <AlertDialogDescription>
              Changes the agent made in it that were not applied are lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={discardWorktree}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
