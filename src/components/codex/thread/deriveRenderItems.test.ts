import { describe, expect, it } from 'vitest';
import type { ServerNotification } from '@/bindings';
import { codexUserTurns, deriveRenderItems } from './deriveRenderItems';

const itemEvent = (
  method: 'item/started' | 'item/completed',
  item: Record<string, unknown>,
  turnId = 'turn1'
): ServerNotification =>
  ({
    method,
    params: { item, threadId: 't1', turnId, startedAtMs: 0, completedAtMs: 0 },
  }) as unknown as ServerNotification;

const turnCompleted = (
  id: string,
  status: 'completed' | 'interrupted' = 'completed',
  durationMs: number | null = 65_000
): ServerNotification =>
  ({
    method: 'turn/completed',
    params: { threadId: 't1', turn: { id, status, durationMs, items: [] } },
  }) as unknown as ServerNotification;

const user = (turnId = 'turn1') =>
  itemEvent('item/started', { type: 'userMessage', id: `u-${turnId}`, content: [] }, turnId);
const reasoning = (id: string, turnId = 'turn1') =>
  itemEvent('item/completed', { type: 'reasoning', id, summary: [], content: [] }, turnId);
const message = (id: string, text: string, turnId = 'turn1') =>
  itemEvent('item/completed', { type: 'agentMessage', id, text }, turnId);

describe('deriveRenderItems turn folding', () => {
  it('folds a completed turn between the user message and the final answer', () => {
    const items = deriveRenderItems([
      user(),
      reasoning('r1'),
      message('m1', 'Looking around'),
      reasoning('r2'),
      message('m2', 'All done'),
      turnCompleted('turn1'),
    ]);

    expect(items.map((item) => item.kind)).toEqual(['event', 'turn', 'event', 'event']);
    const turn = items[1];
    if (turn.kind !== 'turn') throw new Error('expected a turn item');
    expect(turn.durationMs).toBe(65_000);
    expect(turn.stepCount).toBe(2);
    expect(turn.items.map((item) => item.kind)).toEqual(['chain', 'event', 'chain']);
  });

  it('keeps a running turn flat', () => {
    const items = deriveRenderItems([user(), reasoning('r1'), message('m1', 'Partial')]);
    expect(items.map((item) => item.kind)).toEqual(['event', 'chain', 'event']);
  });

  it('keeps an interrupted turn flat', () => {
    const items = deriveRenderItems([
      user(),
      reasoning('r1'),
      message('m1', 'Partial'),
      turnCompleted('turn1', 'interrupted'),
    ]);
    expect(items.some((item) => item.kind === 'turn')).toBe(false);
  });

  it('does not fold a turn that only answered', () => {
    const items = deriveRenderItems([user(), message('m1', 'Hi'), turnCompleted('turn1')]);
    expect(items.some((item) => item.kind === 'turn')).toBe(false);
  });

  it('folds each turn separately', () => {
    const items = deriveRenderItems([
      user('a'),
      reasoning('ra', 'a'),
      message('ma', 'A', 'a'),
      turnCompleted('a'),
      user('b'),
      reasoning('rb', 'b'),
      message('mb', 'B', 'b'),
      turnCompleted('b'),
    ]);
    expect(items.filter((item) => item.kind === 'turn').map((item) => item.key)).toEqual([
      'turn-a',
      'turn-b',
    ]);
  });
});

describe('codexUserTurns', () => {
  it('lists user messages by their row key for the turn navigator', () => {
    const ask = (text: string, turnId: string) =>
      itemEvent(
        'item/started',
        { type: 'userMessage', id: `u-${turnId}`, content: [{ type: 'text', text }] },
        turnId
      );
    const items = deriveRenderItems([
      ask('Find the bug', 'turn1'),
      message('m1', 'Found it', 'turn1'),
      turnCompleted('turn1'),
      ask('Fix it', 'turn2'),
    ]);

    expect(codexUserTurns(items)).toEqual([
      { id: 'event-0', text: 'Find the bug' },
      { id: 'event-3', text: 'Fix it' },
    ]);
  });
});
