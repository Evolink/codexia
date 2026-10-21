import { describe, expect, it } from 'vitest';
import type { ServerNotification } from '@/bindings';
import { collectSubagents, effectiveStatus, type SubagentEntry } from './subagents';

const item = (method: 'item/started' | 'item/completed', value: object) =>
  ({ method, params: { threadId: 'main', turnId: 't', item: value } }) as unknown as ServerNotification;

describe('collectSubagents', () => {
  it('follows a sub-agent from spawn to its last reported state', () => {
    const events = [
      item('item/started', {
        type: 'collabAgentToolCall',
        id: 'c1',
        tool: 'spawnAgent',
        status: 'inProgress',
        receiverThreadIds: ['sub-1'],
        prompt: 'Audit the parser',
        model: 'gpt-x',
        agentsStates: {},
      }),
      item('item/completed', {
        type: 'collabAgentToolCall',
        id: 'c2',
        tool: 'wait',
        status: 'completed',
        receiverThreadIds: ['sub-1'],
        prompt: null,
        model: null,
        agentsStates: { 'sub-1': { status: 'completed', message: 'No issues' } },
      }),
    ];
    expect(collectSubagents(events)).toEqual([
      {
        threadId: 'sub-1',
        status: 'completed',
        message: 'No issues',
        prompt: 'Audit the parser',
        agentPath: null,
        model: 'gpt-x',
      },
    ]);
  });

  it('reads sub-agent activity items and ignores other events', () => {
    const events = [
      item('item/completed', { type: 'commandExecution', id: 'x' }),
      item('item/completed', {
        type: 'subAgentActivity',
        id: 'a1',
        kind: 'started',
        agentThreadId: 'sub-2',
        agentPath: 'root/reviewer',
        model: null,
        reasoningEffort: null,
      }),
    ];
    const [entry] = collectSubagents(events);
    expect(entry).toMatchObject({ threadId: 'sub-2', status: 'running', agentPath: 'root/reviewer' });
  });
});

describe('collectSubagents reply fallback', () => {
  const started = item('item/completed', {
    type: 'subAgentActivity',
    id: 'a1',
    kind: 'started',
    agentThreadId: 'sub-3',
    agentPath: 'root/worker',
    model: null,
    reasoningEffort: null,
  });
  const reply = (text: string) =>
    item('item/completed', { type: 'agentMessage', id: `m-${text}`, text, phase: null });

  it("shows the sub-agent's latest reply when the parent has no state for it", () => {
    const [entry] = collectSubagents([started], { 'sub-3': [reply('first'), reply('a.txt: alpha')] });
    expect(entry.message).toBe('a.txt: alpha');
  });

  it('keeps a message the parent reported', () => {
    const wait = item('item/completed', {
      type: 'collabAgentToolCall',
      id: 'w1',
      tool: 'wait',
      status: 'completed',
      receiverThreadIds: ['sub-3'],
      prompt: null,
      model: null,
      agentsStates: { 'sub-3': { status: 'completed', message: 'from parent' } },
    });
    const [entry] = collectSubagents([started, wait], { 'sub-3': [reply('from child')] });
    expect(entry.message).toBe('from parent');
  });

  it('leaves the message empty when that thread has said nothing', () => {
    expect(collectSubagents([started], {})[0].message).toBeNull();
  });
});

describe('effectiveStatus', () => {
  const entry = (status: SubagentEntry['status']): SubagentEntry => ({
    threadId: 's',
    status,
    message: null,
    prompt: null,
    agentPath: null,
    model: null,
  });
  const timing = (status: 'inProgress' | 'completed' | 'interrupted' | 'failed') => ({
    turnId: 't',
    startedAtMs: 0,
    durationMs: null,
    status,
  });

  it('shows a stopped sub-agent as stopped before the parent hears about it', () => {
    expect(effectiveStatus(entry('running'), timing('interrupted'))).toBe('interrupted');
    expect(effectiveStatus(entry('running'), timing('failed'))).toBe('errored');
  });

  it('keeps the reported state while the sub-agent turn runs or is unknown', () => {
    expect(effectiveStatus(entry('running'), timing('inProgress'))).toBe('running');
    expect(effectiveStatus(entry('running'), undefined)).toBe('running');
  });

  it('never overrides a final reported state', () => {
    expect(effectiveStatus(entry('completed'), timing('interrupted'))).toBe('completed');
    expect(effectiveStatus(entry('errored'), timing('completed'))).toBe('errored');
  });
});
