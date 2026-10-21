import { cn } from 'cn';
import { useEffect } from 'react';
import { AcpComposer } from '@/components/acp/AcpComposer';
import { Composer as CCComposer } from '@/components/cc/composer';
import { Composer as CodexComposer } from '@/components/codex/composer';
import { useApprovalStore, useCodexStore } from '@/components/codex/stores';
import { useWriterConflictStore } from '@/components/codex/stores/useWriterConflictStore';
import { useAgentCenterStore } from '@/stores';
import { useCCStore } from '@/stores/cc';
import { useAcpStore } from '@/stores/useAcpStore';
import { useAgentSettingsStore } from '@/stores/useAgentSettingsStore';
import { WorkspaceSwitcher } from '../common';
import { WriterConflictNotice } from './WriterConflictNotice';

const focusCCInput = () => window.dispatchEvent(new Event('cc-input-focus-request'));

export function AgentComposer() {
  const { selectedAgent } = useAgentSettingsStore();
  const acpActive = useAcpStore((s) => s.active);
  const { currentAgentCardId } = useAgentCenterStore();
  const currentThreadId = useCodexStore((s) => s.currentThreadId);
  const codexPending = useApprovalStore((s) =>
    s.pendingApprovals.some((a) => a.threadId === currentThreadId)
  );
  const ccPending = useCCStore((s) =>
    s.messages.some((m) => m.type === 'permission_request' && !m.resolved)
  );
  const acpPending = useAcpStore((s) => s.permission !== null);
  // The thread shows the approval card in the composer's place, like Codex
  // does. Hide rather than unmount so an unsent draft survives.
  const approvalPending = acpActive
    ? acpPending
    : selectedAgent === 'cc'
      ? ccPending
      : codexPending;
  // Another client owns this Codex thread, so the notice replaces the composer.
  const writerBlocked = useWriterConflictStore(
    (s) =>
      !acpActive &&
      selectedAgent === 'codex' &&
      Boolean(currentThreadId && s.locked[currentThreadId])
  );
  const composerHidden = approvalPending || writerBlocked;

  // Auto-focus the CC composer input when switching to the cc agent
  useEffect(() => {
    if (selectedAgent === 'cc') {
      focusCCInput();
    }
  }, [selectedAgent]);

  return (
    <div className="flex flex-col">
      <div className={cn('flex flex-col', composerHidden && 'hidden')}>
        {/* Project bar sits on top of the input, like the composer's own header */}
        {!currentAgentCardId && <WorkspaceSwitcher className="pb-1" />}
        {/* Input area */}
        <div className="shrink-0 pb-3">
          {acpActive ? (
            <AcpComposer />
          ) : selectedAgent === 'cc' ? (
            <CCComposer />
          ) : (
            <CodexComposer />
          )}
        </div>
      </div>
      {writerBlocked && !approvalPending && (
        <div className="shrink-0 pb-3">
          <WriterConflictNotice />
        </div>
      )}
    </div>
  );
}
