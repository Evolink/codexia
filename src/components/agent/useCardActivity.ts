import { useCallback } from 'react';
import type { CCMessage, PermissionRequestMessage } from '@/components/cc/types/messages';
import {
  useApprovalStore,
  useCodexStore,
  useRequestUserInputStore,
} from '@/components/codex/stores';
import { useCCStore } from '@/stores/cc';
import type { AgentCenterCard } from '@/stores/useAgentCenterStore';

export type CardActivity = 'pending' | 'running' | 'idle';

/**
 * Classifies a tracked thread/session by what it needs from the user right now.
 * `pending` means blocked on the user (approval, input request, or an unresolved
 * Claude Code permission request); `running` means working without needing them.
 */
export function useCardActivity(): (card: AgentCenterCard) => CardActivity {
  const threadStatusMap = useCodexStore((s) => s.threadStatusMap);
  const sessionLoadingMap = useCCStore((s) => s.sessionLoadingMap);
  const sessionMessagesMap = useCCStore((s) => s.sessionMessagesMap);
  const activeSessionIds = useCCStore((s) => s.activeSessionIds);
  const pendingApprovals = useApprovalStore((s) => s.pendingApprovals);
  const pendingRequests = useRequestUserInputStore((s) => s.pendingRequests);

  return useCallback(
    (card) => {
      const blocked =
        pendingApprovals.some((a) => a.threadId === card.id) ||
        pendingRequests.some((r) => r.threadId === card.id);

      if (card.kind === 'codex') {
        const status = threadStatusMap[card.id];
        if (status?.type !== 'active') return blocked ? 'pending' : 'idle';
        return blocked || status.activeFlags.length > 0 ? 'pending' : 'running';
      }

      const awaitingPermission = (sessionMessagesMap[card.id] ?? []).some(
        (m: CCMessage): m is PermissionRequestMessage =>
          m.type === 'permission_request' && !m.resolved
      );
      if (blocked || awaitingPermission) return 'pending';
      // A Claude Code session only counts as running while it is live.
      return activeSessionIds.includes(card.id) && sessionLoadingMap[card.id] ? 'running' : 'idle';
    },
    [
      threadStatusMap,
      sessionLoadingMap,
      sessionMessagesMap,
      activeSessionIds,
      pendingApprovals,
      pendingRequests,
    ]
  );
}
