import type { TFunction } from 'i18next';
import type { GuardianApprovalReviewAction } from '@/bindings/v2';

/** One-line description of what an auto-review was asked to decide. */
export function reviewActionSummary(action: GuardianApprovalReviewAction, t: TFunction): string {
  switch (action.type) {
    case 'command':
      return action.command;
    case 'execve':
      return action.argv.length > 0 ? action.argv.join(' ') : action.program;
    case 'writeStdin':
      return t('autoReview.stdin');
    case 'applyPatch':
      return action.files.length === 1
        ? t('autoReview.patchFile', { file: action.files[0] })
        : t('autoReview.patchFiles', { count: action.files.length });
    case 'networkAccess':
      return t('autoReview.network', { target: action.target });
    case 'mcpToolCall':
      return t('autoReview.mcpTool', {
        tool: action.toolTitle ?? `${action.connectorName ?? action.server}.${action.toolName}`,
      });
    case 'requestPermissions':
      return action.reason ?? t('autoReview.permissions');
  }
}
