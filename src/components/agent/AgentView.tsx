import { cn } from 'cn';
import { lazy, Suspense, useEffect } from 'react';
import { detachBotConnection } from '@/components/acp/botConnection';
import { useAcpEvents } from '@/components/acp/useAcpEvents';
import { useCodexStore } from '@/components/codex/stores';
import { THREAD_COLUMN } from '@/components/common/threadColumn';
import { useCCStore } from '@/stores/cc';
import { useAcpStore } from '@/stores/useAcpStore';
import { useAgentSettingsStore } from '@/stores/useAgentSettingsStore';
import { AgentComposer } from './AgentComposer';
import { AgentPicker } from './AgentPicker';
import { AgentViewHeader } from './AgentViewHeader';

const CodexThread = lazy(() =>
  import('@/components/codex/thread/CodexThread').then((m) => ({ default: m.CodexThread }))
);
const CCSession = lazy(() => import('@/components/cc/session/CCSession'));
const AcpSession = lazy(() => import('@/components/acp/AcpSession'));

/** Renders the transcript for whichever agent drives the chat pane. */
function AgentSession() {
  const { selectedAgent } = useAgentSettingsStore();
  const acpActive = useAcpStore((s) => s.active);
  if (acpActive) return <AcpSession />;
  if (selectedAgent === 'cc') return <CCSession />;
  return <CodexThread />;
}

/** Empty state: agent picker in the middle, composer pinned at the bottom. */
function EmptySessionLayout() {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto flex justify-center">
        <div className={cn(THREAD_COLUMN, 'py-6 my-auto')}>
          <AgentPicker className="justify-center" />
        </div>
      </div>
      <div className="shrink-0 flex justify-center">
        <div className={THREAD_COLUMN}>
          <AgentComposer />
        </div>
      </div>
    </div>
  );
}

export default function AgentView() {
  const { selectedAgent } = useAgentSettingsStore();
  const { currentThreadId } = useCodexStore();
  const { activeSessionId } = useCCStore();
  const {
    active: acpActive,
    connectionId: acpConnectionId,
    sessionId: acpSessionId,
    entries: acpEntries,
    connecting: acpConnecting,
  } = useAcpStore();

  // Subscribed here, not in the transcript: an ACP session with no entries
  // renders the empty layout, and a `session/load` replay arriving while the
  // transcript is unmounted would be dropped, leaving the pane empty.
  useAcpEvents(acpActive ? acpConnectionId : null);

  // The chat pane must not continue on a bot's process, however it got here.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-check whenever the held connection changes
  useEffect(() => {
    if (acpActive) detachBotConnection();
  }, [acpActive, acpConnectionId]);

  // No active thread/session: show the empty state with the composer at the bottom
  // A connected ACP session with nothing said yet is still an empty chat; one
  // without a session id may be waiting on auth, which the transcript shows.
  // One still opening keeps the chat layout: flipping to the empty one and
  // back flashes the agent picker and remounts the composer, losing focus.
  const noActiveSession = acpActive
    ? !acpConnectionId || (Boolean(acpSessionId) && acpEntries.length === 0 && !acpConnecting)
    : selectedAgent === 'codex'
      ? !currentThreadId
      : !activeSessionId;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <AgentViewHeader />
      {noActiveSession ? (
        <EmptySessionLayout />
      ) : (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <Suspense fallback={null}>
              <AgentSession />
            </Suspense>
          </div>
          <div className="shrink-0 flex justify-center">
            <div className={THREAD_COLUMN}>
              <AgentComposer />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
