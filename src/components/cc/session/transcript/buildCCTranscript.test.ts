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
const withUuid = (msg: CCMessage, uuid: string) => ({ ...msg, uuid }) as CCMessage;
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

  it('shows what a sub-agent says, but not its closing report twice', () => {
    const messages: CCMessage[] = [
      user('research'),
      assistant([toolUse('t1', 'Task', { prompt: 'look' })]),
      assistant([text('Checking the config first'), toolUse('s1', 'Read')], 't1'),
      toolResult('s1', 'file', false, 't1'),
      assistant([text('Report')], 't1'),
    ];
    const taskOf = (items: ReturnType<typeof buildCCTranscript>) => {
      const chain = items.find((item) => item.kind === 'steps');
      if (chain?.kind !== 'steps' || chain.steps[0].kind !== 'tool') throw new Error('no task');
      return chain.steps[0];
    };

    // Running: everything the sub-agent said so far is shown.
    expect(taskOf(buildCCTranscript(messages, true)).children.map((c) => c.kind)).toEqual([
      'text',
      'tool',
      'text',
    ]);
    // Finished: the closing text is the report, shown with the call instead.
    const done = taskOf(buildCCTranscript([...messages, toolResult('t1', 'Report')], true));
    expect(done.children.map((c) => c.kind)).toEqual(['text', 'tool']);
  });

  it('marks where each prompt can branch from', () => {
    const items = buildCCTranscript(
      [
        user('first'),
        withUuid(assistant([toolUse('r1', 'Read')]), 'a1'),
        withUuid(toolResult('r1'), 'u1'),
        withUuid(assistant([text('done')]), 'a2'),
        result(),
        user('second'),
        withUuid(assistant([text('sub')], 'r1'), 'side'),
      ],
      false
    );

    const prompts = items.filter((item) => item.kind === 'user');
    expect(prompts.map((p) => [p.text, p.index, p.forkAt])).toEqual([
      ['first', 0, null],
      ['second', 5, 'a2'],
    ]);
  });

  it('refers to messages by their index in the session', () => {
    const init = (sid: string): CCMessage => ({ type: 'system', subtype: 'init', session_id: sid });
    const messages = [user('one'), init('a'), assistant([text('ok')]), user('two'), init('b')];
    const items = buildCCTranscript(messages, false);
    const shown = items.flatMap((item) => (item.kind === 'message' ? [item.index] : []));
    expect(shown.map((index) => messages[index])).toEqual([messages[1], messages[4]]);
    // Keys stay unique across turns for messages without a uuid.
    const keys = items.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
