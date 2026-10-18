import type { TFunction } from 'i18next';
import { getFilename } from '@/utils/getFilename';
import type { ToolResultBlock } from '../../types/messages';
import type { CCStep } from './buildCCTranscript';

/** Plain text of a tool result, without the CLI's `<tool_use_error>` wrapper. */
export function resultText(result: ToolResultBlock | null): string {
  if (!result?.content) return '';
  const text =
    typeof result.content === 'string'
      ? result.content
      : result.content
          .map((part) => (part.type === 'text' && typeof part.text === 'string' ? part.text : ''))
          .filter(Boolean)
          .join('\n');
  return text.replace(/^<tool_use_error>\s*/, '').replace(/\s*<\/tool_use_error>$/, '');
}

/** `mcp__server__tool` → `{ server, tool }`; other names have no server. */
export function splitToolName(name: string): { server: string | null; tool: string } {
  if (!name.startsWith('mcp__')) return { server: null, tool: name };
  const [, server = '', ...rest] = name.split('__');
  return { server, tool: rest.join('__') || name };
}

export const isStepFailed = (step: CCStep) => step.kind === 'tool' && !!step.result?.is_error;

/** Whether `CCToolDetails` has anything to show for a call, besides its error. */
export function hasToolDetails(step: Extract<CCStep, { kind: 'tool' }>): boolean {
  const input = step.block.input ?? {};
  const output = isStepFailed(step) ? '' : resultText(step.result);
  switch (step.block.name) {
    case 'Read':
      return false;
    case 'Edit':
      return true;
    case 'MultiEdit':
      return Array.isArray(input.edits) && input.edits.length > 0;
    case 'Write':
      return !!input.content;
    case 'Grep':
    case 'Glob':
    case 'WebFetch':
    case 'WebSearch':
      return !!output;
    default:
      return JSON.stringify(input) !== '{}' || !!output;
  }
}

/** A step's trace line title: present tense while running, past tense when done. */
export function stepTitle(step: CCStep, t: TFunction): string {
  if (step.kind === 'thinking') return t('items.thinking');

  const { block, running } = step;
  const input = block.input ?? {};
  const failed = isStepFailed(step);
  const pick = (runningKey: string, doneKey: string, values: Record<string, string>) => {
    if (running) return t(runningKey, values);
    const done = t(doneKey, values);
    return failed ? t('items.toolFailed', { tool: done }) : done;
  };

  switch (block.name) {
    case 'Bash': {
      const command = String(input.command ?? input.description ?? '');
      if (running) return t('items.runningCommand', { command });
      return failed ? t('items.commandFailed', { command }) : t('items.ranCommand', { command });
    }
    case 'Read':
      return pick('items.readingFile', 'items.readFile', { file: getFilename(input.file_path) });
    case 'Grep':
    case 'Glob':
      return pick('items.searching', 'items.searched', { query: String(input.pattern ?? '') });
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return pick('items.editingFile', 'items.editedFile', {
        file: getFilename(input.file_path ?? input.notebook_path),
      });
    case 'Write':
      return pick('items.writingFile', 'items.wroteFile', { file: getFilename(input.file_path) });
    case 'WebFetch':
      return pick('items.fetching', 'items.fetched', { url: String(input.url ?? '') });
    case 'WebSearch':
      return pick('items.searchingWeb', 'items.webSearch', { query: String(input.query ?? '') });
    case 'TodoWrite':
      return t('items.updatedTodos');
    case 'Task':
    case 'Agent': {
      const agent = String(input.subagent_type || 'agent');
      if (running) return t('items.runningAgent', { agent });
      return failed ? t('items.agentFailed', { agent }) : t('items.ranAgent', { agent });
    }
    default: {
      const { tool } = splitToolName(block.name);
      if (running) return t('items.callingTool', { tool });
      return failed ? t('items.toolFailed', { tool }) : t('items.calledTool', { tool });
    }
  }
}
