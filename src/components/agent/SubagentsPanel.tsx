import { Bot, Square } from 'lucide-react';
import { useMemo } from 'react';
import type { CollabAgentStatus } from '@/bindings/v2';
import { collectSubagents, effectiveStatus } from '@/components/codex/items/subagents';
import { useCodexStore } from '@/components/codex/stores';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { codexService } from '@/services/codexService';
import { getCodexActiveTurnId } from './utils';

const STATUS_LABEL: Record<CollabAgentStatus, string> = {
  pendingInit: 'Starting',
  running: 'Running',
  interrupted: 'Stopped',
  completed: 'Done',
  errored: 'Errored',
  shutdown: 'Shut down',
  notFound: 'Not found',
};

const STATUS_DOT: Partial<Record<CollabAgentStatus, string>> = {
  pendingInit: 'bg-muted-foreground/40 animate-pulse',
  running: 'bg-green-500 animate-pulse',
  completed: 'bg-green-500',
  errored: 'bg-red-500',
  notFound: 'bg-red-500',
  interrupted: 'bg-amber-500',
};

export function SubagentsPanel() {
  const currentThreadId = useCodexStore((s) => s.currentThreadId);
  const events = useCodexStore((s) => (currentThreadId ? s.events[currentThreadId] : undefined));
  const turnTimingMap = useCodexStore((s) => s.turnTimingMap);
  const subagents = useMemo(() => collectSubagents(events ?? []), [events]);

  if (subagents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-4 text-xs text-muted-foreground/60">
        <Bot className="size-4" />
        No sub-agents in this thread
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-1 overflow-y-auto p-2">
      {subagents.map((agent) => {
        const timing = turnTimingMap[agent.threadId];
        const turnId = getCodexActiveTurnId(timing);
        const status = effectiveStatus(agent, timing);
        const title = agent.agentPath || `…${agent.threadId.slice(-8)}`;
        return (
          <div key={agent.threadId} className="flex flex-col gap-1 rounded-md border p-2">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  STATUS_DOT[status] ?? 'bg-muted-foreground/40'
                )}
              />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{title}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {STATUS_LABEL[status]}
              </span>
              {turnId && (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  title="Stop"
                  aria-label={`Stop ${title}`}
                  onClick={() => codexService.turnInterrupt(agent.threadId, turnId)}
                >
                  <Square className="text-destructive" />
                </Button>
              )}
            </div>
            {agent.prompt && (
              <p className="line-clamp-3 text-xs italic text-muted-foreground">{agent.prompt}</p>
            )}
            {agent.message && <p className="line-clamp-3 text-xs">{agent.message}</p>}
            {agent.model && (
              <span className="text-[10px] text-muted-foreground/70">{agent.model}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default SubagentsPanel;
