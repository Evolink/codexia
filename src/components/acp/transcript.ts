import type { ToolStatus } from '@/components/ai-elements/Tool';
import type { AcpEntry } from '@/stores/useAcpStore';

export type AcpStepEntry = Extract<AcpEntry, { role: 'tool' | 'thought' }>;

/** One rendered row of the ACP transcript. */
export type AcpRenderItem =
  | { kind: 'entry'; entry: Exclude<AcpEntry, AcpStepEntry> }
  | { kind: 'chain'; key: string; steps: AcpStepEntry[]; running: boolean }
  | { kind: 'turn'; key: string; stepCount: number; items: AcpRenderItem[] };

/** Maps an ACP `ToolCallStatus` onto a trace line status. */
export function toolStatus(status: string): ToolStatus | undefined {
  if (status === 'in_progress') return 'running';
  if (status === 'failed') return 'error';
  if (status === 'pending') return 'pending';
  return undefined;
}

const isStep = (entry: AcpEntry): entry is AcpStepEntry =>
  entry.role === 'tool' || entry.role === 'thought';

/** Groups consecutive tool calls and thoughts into chains. */
function chainEntries(entries: AcpEntry[], live: boolean): AcpRenderItem[] {
  const items: AcpRenderItem[] = [];
  let chain: Extract<AcpRenderItem, { kind: 'chain' }> | null = null;
  for (const entry of entries) {
    if (isStep(entry)) {
      if (!chain) {
        chain = { kind: 'chain', key: `chain-${entry.id}`, steps: [], running: false };
        items.push(chain);
      }
      chain.steps.push(entry);
    } else {
      chain = null;
      items.push({ kind: 'entry', entry });
    }
  }
  // Only the trailing chain of a live turn is still being worked on.
  const last = items[items.length - 1];
  if (live && last?.kind === 'chain') last.running = true;
  return items;
}

/**
 * Builds the ACP transcript: each turn starts at a user entry. A finished turn
 * folds its steps and interim replies above the final reply; errors stay visible.
 */
export function buildAcpTranscript(entries: AcpEntry[], running: boolean): AcpRenderItem[] {
  const turns: AcpEntry[][] = [];
  for (const entry of entries) {
    if (entry.role === 'user' || turns.length === 0) turns.push([]);
    turns[turns.length - 1].push(entry);
  }

  return turns.flatMap((turn, turnIndex) => {
    const live = running && turnIndex === turns.length - 1;
    const head = turn[0]?.role === 'user' ? [turn[0]] : [];
    const body = turn.slice(head.length);
    let answerIndex = body.length - 1;
    while (answerIndex >= 0 && body[answerIndex].role !== 'agent') answerIndex--;
    const work = answerIndex > 0 ? body.slice(0, answerIndex) : [];
    const folded = work.filter((entry) => entry.role !== 'error');

    if (live || folded.length === 0) {
      return chainEntries(turn, live);
    }

    return [
      ...chainEntries(head, false),
      {
        kind: 'turn' as const,
        key: `turn-${folded[0].id}`,
        stepCount: folded.filter(isStep).length,
        items: chainEntries(folded, false),
      },
      ...chainEntries(
        [...work.filter((entry) => entry.role === 'error'), ...body.slice(answerIndex)],
        false
      ),
    ];
  });
}
