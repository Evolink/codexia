import { describe, expect, it } from 'vitest';
import type { AcpEntry } from '@/stores/useAcpStore';
import { buildAcpTranscript } from './transcript';

const user = (id: string): AcpEntry => ({ id, role: 'user', text: 'ask' });
const agent = (id: string, text = 'reply'): AcpEntry => ({ id, role: 'agent', text });
const thought = (id: string): AcpEntry => ({ id, role: 'thought', text: 'hmm' });
const tool = (id: string, status = 'completed'): AcpEntry => ({
  id,
  role: 'tool',
  toolCallId: id,
  title: 'Read file',
  status,
});

describe('buildAcpTranscript', () => {
  it('folds a finished turn above its final reply', () => {
    const items = buildAcpTranscript(
      [user('u'), thought('t'), tool('a'), agent('m1', 'interim'), tool('b'), agent('m2')],
      false
    );
    expect(items.map((item) => item.kind)).toEqual(['entry', 'turn', 'entry']);
    const turn = items[1];
    if (turn.kind !== 'turn') throw new Error('expected a turn');
    expect(turn.stepCount).toBe(3);
    expect(turn.items.map((item) => item.kind)).toEqual(['chain', 'entry', 'chain']);
  });

  it('keeps the running turn flat and marks its trailing chain as running', () => {
    const items = buildAcpTranscript([user('u'), agent('m1'), tool('a', 'in_progress')], true);
    expect(items.map((item) => item.kind)).toEqual(['entry', 'entry', 'chain']);
    const chain = items[2];
    expect(chain.kind === 'chain' && chain.running).toBe(true);
  });

  it('keeps errors visible outside the fold', () => {
    const items = buildAcpTranscript(
      [user('u'), tool('a'), { id: 'e', role: 'error', text: 'boom' }, agent('m')],
      false
    );
    expect(items.map((item) => (item.kind === 'entry' ? item.entry.id : item.kind))).toEqual([
      'u',
      'turn',
      'e',
      'm',
    ]);
  });

  it('does not fold a turn that only replied', () => {
    const items = buildAcpTranscript([user('u'), agent('m')], false);
    expect(items.some((item) => item.kind === 'turn')).toBe(false);
  });
});
