import {
  ArrowRightLeftIcon,
  BrainIcon,
  FilePenIcon,
  FileTextIcon,
  GlobeIcon,
  SearchIcon,
  TerminalIcon,
  Trash2Icon,
  WrenchIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { CodeOutput } from '@/components/ai-elements/CodeOutput';
import { Terminal } from '@/components/ai-elements/Terminal';
import { Tool } from '@/components/ai-elements/Tool';
import { DiffMessage } from '@/components/cc/session/messages/DiffMessage';
import type { AcpEntry, AcpToolContent } from '@/stores/useAcpStore';
import { toolStatus } from './transcript';

type ToolEntry = Extract<AcpEntry, { role: 'tool' }>;

// ACP `ToolKind` values; anything else falls back to a wrench.
const KIND_ICON: Record<string, ReactNode> = {
  read: <FileTextIcon />,
  edit: <FilePenIcon />,
  delete: <Trash2Icon />,
  move: <ArrowRightLeftIcon />,
  search: <SearchIcon />,
  execute: <TerminalIcon />,
  think: <BrainIcon />,
  fetch: <GlobeIcon />,
};

/** Text of a `content` block, or null when it carries no inline text. */
function blockText(item: AcpToolContent): string | null {
  if (item.type !== 'content') return null;
  if (item.content.type === 'text') return item.content.text ?? '';
  return item.content.uri ?? null;
}

function ToolContent({ item }: { item: AcpToolContent }) {
  if (item.type === 'diff') {
    return (
      <div className="space-y-1">
        <div className="font-mono text-xs">{item.path}</div>
        <DiffMessage oldString={item.oldText ?? ''} newString={item.newText} />
      </div>
    );
  }

  if (item.type === 'terminal') {
    return <p className="font-mono text-xs">terminal {item.terminalId}</p>;
  }

  const text = blockText(item);
  if (!text) return null;
  return <CodeOutput code={text} language="text" />;
}

/**
 * The shell command a tool call runs, when it has one. Agents name the field
 * differently (`command`, `cmd`) and some pass argv rather than a string.
 */
function commandOf(rawInput: unknown): string | null {
  if (!rawInput || typeof rawInput !== 'object') return null;
  const raw = rawInput as Record<string, unknown>;
  const value = raw.command ?? raw.cmd;
  if (typeof value === 'string') return value.trim() || null;
  if (Array.isArray(value))
    return value.filter((part) => typeof part === 'string').join(' ') || null;
  return null;
}

/**
 * One ACP tool call as a trace line: shell calls open onto their command and
 * output, others onto whatever the agent attached (diffs, text, raw input).
 */
export function AcpToolCall({ entry }: { entry: ToolEntry }) {
  const content = entry.content ?? [];
  const status = toolStatus(entry.status);
  const command = commandOf(entry.rawInput);

  if (command && content.every((item) => item.type === 'content')) {
    const output = content
      .map(blockText)
      .filter((text): text is string => !!text)
      .join('\n');
    return <Terminal command={command} title={entry.title} status={status} output={output} />;
  }

  // The raw JSON is only the fallback for calls that attached nothing else.
  const rawInput =
    content.length === 0 && entry.rawInput ? JSON.stringify(entry.rawInput, null, 2) : null;
  const locations = entry.locations ?? [];
  const hasDetails = content.length > 0 || rawInput !== null || locations.length > 0;

  return (
    <Tool
      icon={(entry.kind && KIND_ICON[entry.kind]) ?? <WrenchIcon />}
      title={entry.title}
      status={status}
    >
      {hasDetails ? (
        <div className="flex flex-col gap-2">
          {content.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: append-only content stream, no stable id
            <ToolContent key={i} item={item} />
          ))}
          {rawInput && <CodeOutput code={rawInput} language="json" />}
          {locations.length > 0 && (
            <div className="flex flex-wrap gap-2 font-mono text-xs">
              {locations.map((loc) => {
                const label = loc.line ? `${loc.path}:${loc.line}` : loc.path;
                return <span key={label}>{label}</span>;
              })}
            </div>
          )}
        </div>
      ) : null}
    </Tool>
  );
}
