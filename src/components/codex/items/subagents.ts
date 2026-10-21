import type { ServerNotification } from '@/bindings';
import type { CollabAgentStatus } from '@/bindings/v2';

export interface SubagentEntry {
  threadId: string;
  status: CollabAgentStatus;
  message: string | null;
  prompt: string | null;
  agentPath: string | null;
  model: string | null;
}

/** Sub-agents a thread spawned, with the last state each one was reported in. */
export function collectSubagents(events: ServerNotification[]): SubagentEntry[] {
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
  return [...byId.values()];
}
