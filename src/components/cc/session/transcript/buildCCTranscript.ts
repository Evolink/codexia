import type { CCMessage, ResultMessage, ToolResultBlock, ToolUseBlock } from '../../types/messages';
import { isToolResultBlock } from '../../types/messages';

/** Tools whose call is work handed to a sub-agent. */
export const SUBAGENT_TOOLS = new Set(['Task', 'Agent']);

/** One step of agent work: a thought or a tool call with its result. */
export type CCStep =
  | { kind: 'thinking'; key: string; text: string }
  /** What a sub-agent said along the way (forwarded with `forward_subagent_text`). */
  | { kind: 'text'; key: string; text: string }
  | {
      kind: 'tool';
      key: string;
      block: ToolUseBlock;
      result: ToolResultBlock | null;
      running: boolean;
      /** Steps a sub-agent took for this call (`parent_tool_use_id`). */
      children: CCStep[];
    };

export type CCRenderItem =
  | {
      kind: 'user';
      key: string;
      text: string;
      /** Index of the prompt in the session's messages. */
      index?: number;
      /**
       * The transcript entry a branch that rewrites this prompt resumes after;
       * `null` for the first prompt, which has no history to keep.
       */
      forkAt?: string | null;
    }
  | { kind: 'text'; key: string; text: string }
  | { kind: 'error'; key: string; text: string }
  | { kind: 'steps'; key: string; steps: CCStep[]; running: boolean }
  /** AskUserQuestion: waits on the user, so it is never folded away. */
  | { kind: 'question'; key: string; block: ToolUseBlock }
  /** A message rendered as-is: permission requests, session init, rate limits. */
  | { kind: 'message'; key: string; index: number }
  | {
      kind: 'turn';
      key: string;
      stepCount: number;
      result: ResultMessage | null;
      items: CCRenderItem[];
    };

type Unit = Exclude<CCRenderItem, { kind: 'steps' | 'turn' }> | { kind: 'step'; step: CCStep };

interface Context {
  results: Map<string, ToolResultBlock>;
  children: Map<string, CCMessage[]>;
  prompts: Map<CCMessage, { index: number; forkAt: string | null }>;
  /** Each message's index in the session, which `message` items refer to. */
  indices: Map<CCMessage, number>;
  /** Whether a call without a result may still be running. */
  live: boolean;
  showThinking: boolean;
}

function toolStep(block: ToolUseBlock, ctx: Context): CCStep {
  const result = ctx.results.get(block.id) ?? null;
  const children = stepsOf(ctx.children.get(block.id) ?? [], ctx);
  // A finished sub-agent's closing text is its report, shown with the call.
  if (result) {
    while (children[children.length - 1]?.kind === 'text') children.pop();
  }
  return {
    kind: 'tool',
    key: block.id,
    block,
    result,
    running: ctx.live && result === null,
    children,
  };
}

/** A sub-agent's messages as a flat list of steps; its prompt is left out. */
function stepsOf(messages: CCMessage[], ctx: Context): CCStep[] {
  const steps: CCStep[] = [];
  messages.forEach((msg, i) => {
    if (msg.type !== 'assistant') return;
    msg.message.content.forEach((block, j) => {
      const key = `${msg.uuid ?? i}-${j}`;
      if (block.type === 'thinking' && ctx.showThinking && block.thinking.trim()) {
        steps.push({ kind: 'thinking', key, text: block.thinking });
      } else if (block.type === 'text' && block.text.trim()) {
        steps.push({ kind: 'text', key, text: block.text });
      } else if (block.type === 'tool_use') {
        steps.push(toolStep(block, ctx));
      }
    });
  });
  return steps;
}

function unitsOf(
  messages: CCMessage[],
  ctx: Context
): { units: Unit[]; result: ResultMessage | null } {
  const units: Unit[] = [];
  let result: ResultMessage | null = null;
  messages.forEach((msg, index) => {
    // Index in the session, not the turn: keys and `message` items span turns.
    const at = ctx.indices.get(msg) ?? index;
    const key = msg.type === 'assistant' || msg.type === 'user' ? (msg.uuid ?? `${at}`) : `${at}`;
    switch (msg.type) {
      case 'user':
        if (msg.text) {
          units.push({ kind: 'user', key: `user-${key}`, text: msg.text, ...ctx.prompts.get(msg) });
        }
        return;
      case 'assistant':
        if (msg.message.error) {
          units.push({ kind: 'error', key: `error-${key}`, text: msg.message.error });
        }
        msg.message.content.forEach((block, j) => {
          const blockKey = `${key}-${j}`;
          if (block.type === 'text') {
            if (block.text.trim()) units.push({ kind: 'text', key: blockKey, text: block.text });
          } else if (block.type === 'thinking') {
            if (ctx.showThinking && block.thinking.trim()) {
              units.push({
                kind: 'step',
                step: { kind: 'thinking', key: blockKey, text: block.thinking },
              });
            }
          } else if (block.type === 'tool_use') {
            if (block.name === 'AskUserQuestion') {
              units.push({ kind: 'question', key: block.id, block });
            } else {
              units.push({ kind: 'step', step: toolStep(block, ctx) });
            }
          }
        });
        return;
      case 'result':
        // Its timing and cost label the turn's work summary.
        result = msg;
        if (msg.is_error) {
          units.push({ kind: 'error', key: `result-${index}`, text: msg.result || msg.subtype });
        }
        return;
      case 'permission_request':
      case 'system':
      case 'rate_limit_event': {
        units.push({ kind: 'message', key: `message-${at}`, index: at });
        return;
      }
      default:
        return;
    }
  });
  return { units, result };
}

/** Groups consecutive steps into `steps` items. */
function chain(units: Unit[], live: boolean): CCRenderItem[] {
  const items: CCRenderItem[] = [];
  let current: Extract<CCRenderItem, { kind: 'steps' }> | null = null;
  for (const unit of units) {
    if (unit.kind === 'step') {
      if (!current) {
        current = { kind: 'steps', key: `steps-${unit.step.key}`, steps: [], running: false };
        items.push(current);
      }
      current.steps.push(unit.step);
    } else {
      current = null;
      items.push(unit);
    }
  }
  const last = items[items.length - 1];
  if (live && last?.kind === 'steps') last.running = true;
  return items;
}

const countSteps = (units: Unit[]) => units.filter((unit) => unit.kind === 'step').length;

/**
 * Builds the Claude Code transcript. Sub-agent messages nest under the call that
 * started them, consecutive steps form chains, and each finished turn folds its
 * work above the final reply. Items that need the user stay outside the fold.
 */
export function buildCCTranscript(
  messages: CCMessage[],
  isLoading: boolean,
  { showThinking = true }: { showThinking?: boolean } = {}
): CCRenderItem[] {
  const results = new Map<string, ToolResultBlock>();
  const toolIds = new Set<string>();
  for (const msg of messages) {
    if (msg.type === 'user') {
      for (const block of msg.content ?? []) {
        if (isToolResultBlock(block) && block.tool_use_id) results.set(block.tool_use_id, block);
      }
    } else if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
        if (block.type === 'tool_use') toolIds.add(block.id);
      }
    }
  }

  // Messages from a sub-agent carry the id of the call that started it.
  const children = new Map<string, CCMessage[]>();
  const topLevel: CCMessage[] = [];
  // Each prompt can be rewritten on a branch that resumes after the last
  // main-conversation entry before it.
  const prompts = new Map<CCMessage, { index: number; forkAt: string | null }>();
  let lastUuid: string | null = null;
  const indices = new Map<CCMessage, number>();
  messages.forEach((msg, index) => {
    indices.set(msg, index);
    const parent =
      msg.type === 'user' || msg.type === 'assistant' ? msg.parent_tool_use_id : undefined;
    if (parent && toolIds.has(parent)) {
      children.set(parent, [...(children.get(parent) ?? []), msg]);
      return;
    }
    topLevel.push(msg);
    if (msg.type === 'user' && msg.text) {
      prompts.set(msg, { index, forkAt: lastUuid });
    } else if ((msg.type === 'user' || msg.type === 'assistant') && msg.uuid) {
      lastUuid = msg.uuid;
    }
  });

  // Split into turns at each user prompt.
  const turns: CCMessage[][] = [];
  for (const msg of topLevel) {
    if ((msg.type === 'user' && msg.text) || turns.length === 0) turns.push([]);
    turns[turns.length - 1].push(msg);
  }

  return turns.flatMap((turnMessages, turnIndex) => {
    const live = isLoading && turnIndex === turns.length - 1;
    const { units, result } = unitsOf(turnMessages, {
      results,
      children,
      prompts,
      indices,
      live,
      showThinking,
    });
    const head = units[0]?.kind === 'user' ? [units[0]] : [];
    const body = units.slice(head.length);

    let answerIndex = body.length - 1;
    while (answerIndex >= 0 && body[answerIndex].kind !== 'text') answerIndex--;
    const work = answerIndex > 0 ? body.slice(0, answerIndex) : [];
    // Folded: steps and interim replies. Kept visible: anything the user may act on.
    const folded = work.filter((unit) => unit.kind === 'step' || unit.kind === 'text');

    if (live || countSteps(folded) === 0) {
      return chain(units, live);
    }

    const kept = work.filter((unit) => unit.kind !== 'step' && unit.kind !== 'text');
    return [
      ...chain(head, false),
      {
        kind: 'turn' as const,
        key: `turn-${folded[0].kind === 'step' ? folded[0].step.key : folded[0].key}`,
        stepCount: countSteps(folded),
        result,
        items: chain(folded, false),
      },
      ...chain([...kept, ...body.slice(answerIndex)], false),
    ];
  });
}

/** The user messages of a built transcript, for the thread's turn navigator. */
export function ccUserTurns(items: CCRenderItem[]): { id: string; text: string }[] {
  return items.flatMap((item) => (item.kind === 'user' ? [{ id: item.key, text: item.text }] : []));
}
