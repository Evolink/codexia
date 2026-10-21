import type { ServerNotification } from '@/bindings';
import type { CollabAgentStatus } from '@/bindings/v2';
import type { TurnTiming } from '@/components/codex/stores/useCodexStore';

export interface SubagentEntry {
  threadId: string;
  status: CollabAgentStatus;
  message: string | null;
  prompt: string | null;
  agentPath: string | null;
  model: string | null;
}

/** What a sub-agent last said, from its own thread. */
function lastReply(events: ServerNotification[] | undefined): string | null {
  for (let i = (events?.length ?? 0) - 1; i >= 0; i -= 1) {
    const event = events?.[i];
    if (event?.method !== 'item/completed') continue;
    if (event.params.item.type === 'agentMessage' && event.params.item.text) {
      return event.params.item.text;
    }
  }
  return null;
}

/**
 * Sub-agents a thread spawned, with the last state each one was reported in.
 * Codex reports a spawn as an activity item with no prompt, and the parent's wait
 * call carries no states, so `eventsByThread` supplies what the sub-agent said.
 */
export function collectSubagents(
  events: ServerNotification[],
  eventsByThread: Record<string, ServerNotification[]> = {}
): SubagentEntry[] {
  const byId = new Map<string, SubagentEntry>();
  const entryFor = (threadId: string): SubagentEntry => {
    let entry = byId.get(threadId);
    if (!entry) {
      entry = {
        threadId,
        status: 'pendingInit',
        message: null,
        prompt: null,
        agentPath: null,
        model: null,
      };
      byId.set(threadId, entry);
    }
    return entry;
  };

  for (const event of events) {
    if (event.method !== 'item/started' && event.method !== 'item/completed') continue;
    const item = event.params.item;
    if (item.type === 'collabAgentToolCall') {
      for (const threadId of item.receiverThreadIds) {
        const entry = entryFor(threadId);
        if (item.tool === 'spawnAgent' && item.prompt) entry.prompt = item.prompt;
        if (item.model) entry.model = item.model;
      }
      for (const [threadId, state] of Object.entries(item.agentsStates ?? {})) {
        if (!state) continue;
        const entry = entryFor(threadId);
        entry.status = state.status;
        entry.message = state.message;
      }
    } else if (item.type === 'subAgentActivity') {
      const entry = entryFor(item.agentThreadId);
      entry.agentPath = item.agentPath || entry.agentPath;
      entry.model = item.model ?? entry.model;
      if (item.kind === 'started') entry.status = 'running';
      else if (item.kind === 'completed') entry.status = 'completed';
      else if (item.kind === 'interrupted') entry.status = 'interrupted';
    }
  }
  for (const entry of byId.values()) {
    entry.message ??= lastReply(eventsByThread[entry.threadId]);
  }
  return [...byId.values()];
}

const TURN_STATUS: Record<Exclude<TurnTiming['status'], 'inProgress'>, CollabAgentStatus> = {
  completed: 'completed',
  interrupted: 'interrupted',
  failed: 'errored',
};

/**
 * The parent thread only learns a sub-agent's state when one of its collab calls
 * returns, so a stopped sub-agent keeps reading "running" until the parent's wait
 * ends. Its own turn knows sooner; prefer that once the turn is over.
 */
export function effectiveStatus(
  entry: SubagentEntry,
  timing: TurnTiming | undefined
): CollabAgentStatus {
  const live = entry.status === 'running' || entry.status === 'pendingInit';
  if (!live || !timing || timing.status === 'inProgress') return entry.status;
  return TURN_STATUS[timing.status];
}
