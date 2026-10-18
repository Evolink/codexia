import { describe, expect, it } from 'vitest';
import type { CCMessage, ContentBlock } from '../../types/messages';
import { buildCCTranscript } from './buildCCTranscript';

const user = (text: string): CCMessage => ({ type: 'user', text });
const assistant = (content: ContentBlock[], parent?: string): CCMessage => ({
  type: 'assistant',
  message: { content },
  ...(parent ? { parent_tool_use_id: parent } : {}),
});
const toolUse = (id: string, name: string, input: Record<string, unknown> = {}): ContentBlock => ({
  type: 'tool_use',
  id,
  name,
  input,
});
const toolResult = (id: string, content = 'ok', isError = false, parent?: string): CCMessage => ({
  type: 'user',
  content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }],
  ...(parent ? { parent_tool_use_id: parent } : {}),
});
const text = (value: string): ContentBlock => ({ type: 'text', text: value });
const result = (): CCMessage => ({
  type: 'result',
  subtype: 'success',
  duration_ms: 12_300,
  duration_api_ms: 10_000,
  is_error: false,
  num_turns: 3,
  session_id: 's',
  total_cost_usd: 0.0123,
});

describe('buildCCTranscript', () => {
  it('folds a finished turn above its final reply', () => {
    const items = buildCCTranscript(
      [
        user('fix it'),
        assistant([toolUse('r1', 'Read', { file_path: '/a/b.ts' })]),
        toolResult('r1'),
        assistant([text('Found it'), toolUse('e1', 'Edit', { file_path: '/a/b.ts' })]),
        toolResult('e1'),
        assistant([text('Done.')]),
        result(),
      ],
      false
    );

    expect(items.map((item) => item.kind)).toEqual(['user', 'turn', 'text']);
    const turn = items[1];
    if (turn.kind !== 'turn') throw new Error('expected a turn');
    expect(turn.stepCount).toBe(2);
    expect(turn.result?.duration_ms).toBe(12_300);
    expect(turn.items.map((item) => item.kind)).toEqual(['steps', 'text', 'steps']);
  });

  it('keeps the running turn flat, with unanswered calls running', () => {
    const items = buildCCTranscript(
      [user('go'), assistant([toolUse('b1', 'Bash', { command: 'ls' })])],
      true
    );
    expect(items.map((item) => item.kind)).toEqual(['user', 'steps']);
    const steps = items[1];
    if (steps.kind !== 'steps') throw new Error('expected steps');
    expect(steps.running).toBe(true);
    expect(steps.steps[0].kind === 'tool' && steps.steps[0].running).toBe(true);
  });

  it('pairs each call with its result, errors included', () => {
    const items = buildCCTranscript(
      [user('go'), assistant([toolUse('g1', 'Grep')]), toolResult('g1', 'no such dir', true)],
      false
    );
    const steps = items[1];
    if (steps.kind !== 'steps') throw new Error('expected steps');
    const step = steps.steps[0];
    expect(step.kind === 'tool' && step.result?.is_error).toBe(true);
  });

  it('nests sub-agent messages under the call that started them', () => {
    const items = buildCCTranscript(
      [
        user('research'),
        assistant([toolUse('t1', 'Task', { subagent_type: 'Explore', prompt: 'look' })]),
        { type: 'user', text: 'look', parent_tool_use_id: 't1' },
        assistant([toolUse('s1', 'Read', { file_path: '/x.ts' })], 't1'),
        toolResult('s1', 'file', false, 't1'),
        toolResult('t1', 'Report'),
        assistant([text('Summary')]),
      ],
      false
    );

    const turn = items.find((item) => item.kind === 'turn');
    if (turn?.kind !== 'turn') throw new Error('expected a turn');
    const chain = turn.items[0];
    if (chain.kind !== 'steps') throw new Error('expected steps');
    expect(chain.steps).toHaveLength(1);
    const task = chain.steps[0];
    if (task.kind !== 'tool') throw new Error('expected a tool step');
    expect(task.children.map((child) => child.key)).toEqual(['s1']);
  });

  it('never folds a question away', () => {
    const items = buildCCTranscript(
      [
        user('plan'),
        assistant([toolUse('r1', 'Read'), toolUse('q1', 'AskUserQuestion', { questions: [] })]),
        assistant([text('Waiting for your answer')]),
        result(),
      ],
      false
    );
    expect(items.map((item) => item.kind)).toEqual(['user', 'turn', 'question', 'text']);
  });

  it('leaves thinking out when it is turned off', () => {
    const thinking: ContentBlock = { type: 'thinking', thinking: 'hmm', signature: '' };
    const items = buildCCTranscript([user('hi'), assistant([thinking, text('Hello')])], false, {
      showThinking: false,
    });
    expect(items.map((item) => item.kind)).toEqual(['user', 'text']);
  });
});
