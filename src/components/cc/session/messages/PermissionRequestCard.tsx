import { FilePen, Globe, ShieldCheck, ShieldX, SquareTerminal, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ApprovalCard, ApprovalCode } from '@/components/common';
import type { PermissionRequestMessage } from '../../types/messages';
import type { PermissionDecision } from '../../types/permission';
import { DiffMessage } from './DiffMessage';
import { ToolInputDisplay } from './ToolInputDisplay';

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
const WEB_TOOLS = new Set(['WebFetch', 'WebSearch']);

const RESOLVED_KEY: Record<PermissionDecision, string> = {
  allow: 'approval.allowed',
  allow_always: 'approval.allowedSession',
  allow_project: 'approval.allowedProject',
  deny: 'approval.denied',
};

interface Props {
  msg: PermissionRequestMessage;
  onResolve: (id: string, decision: PermissionDecision) => void | Promise<void>;
}

function basename(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

/** One-line summary of what the tool will touch. */
function toolSubject(msg: PermissionRequestMessage): string {
  const input = msg.toolInput;
  return String(
    input.command ?? input.file_path ?? input.notebook_path ?? input.url ?? input.query ?? ''
  );
}

/** Compact history row for a request that was already answered. */
export function ResolvedPermissionRow({ msg }: { msg: PermissionRequestMessage }) {
  const { t } = useTranslation('thread');
  if (!msg.resolved) return null;
  const denied = msg.resolved === 'deny';
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      {denied ? (
        <ShieldX className="size-3.5 shrink-0" />
      ) : (
        <ShieldCheck className="size-3.5 shrink-0" />
      )}
      <span className="shrink-0">{t(RESOLVED_KEY[msg.resolved])}</span>
      <span className="shrink-0">·</span>
      <span className="truncate font-mono">{toolSubject(msg) || msg.toolName}</span>
    </div>
  );
}

type ToolCategory = 'terminal' | 'edit' | 'web' | 'tool';

const CATEGORY_ICON: Record<ToolCategory, ReactNode> = {
  terminal: <SquareTerminal />,
  edit: <FilePen />,
  web: <Globe />,
  tool: <Wrench />,
};

function toolCategory(msg: PermissionRequestMessage): ToolCategory {
  const { toolName, toolInput } = msg;
  if (toolName === 'Bash') return 'terminal';
  if (EDIT_TOOLS.has(toolName) && (toolInput.file_path || toolInput.notebook_path)) return 'edit';
  return WEB_TOOLS.has(toolName) ? 'web' : 'tool';
}

function PermissionToolBody({
  msg,
  category,
}: {
  msg: PermissionRequestMessage;
  category: ToolCategory;
}) {
  const { toolName, toolInput } = msg;
  if (category === 'terminal') {
    return <ApprovalCode>{String(toolInput.command ?? '')}</ApprovalCode>;
  }
  if (category !== 'edit') {
    return <ToolInputDisplay input={toolInput} highlightKeys={['file_path', 'path', 'command']} />;
  }
  return (
    <>
      <div className="truncate font-mono text-xs text-muted-foreground">
        {String(toolInput.file_path ?? toolInput.notebook_path)}
      </div>
      {toolName === 'Edit' && (
        <DiffMessage
          oldString={String(toolInput.old_string ?? '')}
          newString={String(toolInput.new_string ?? '')}
        />
      )}
      {toolName === 'Write' && <ApprovalCode>{String(toolInput.content ?? '')}</ApprovalCode>}
    </>
  );
}

export function PermissionRequestCard({ msg, onResolve }: Props) {
  const { t } = useTranslation('thread');
  const { toolName, toolInput } = msg;
  const category = toolCategory(msg);
  const resolve = (decision: PermissionDecision) => onResolve(msg.requestId, decision);

  const kind = {
    terminal: t('approval.terminal'),
    edit: t('approval.editFiles'),
    web: t('approval.network'),
    tool: t('approval.tool'),
  }[category];
  const title =
    category === 'terminal'
      ? String(toolInput.description || t('approval.runCommand'))
      : category === 'edit'
        ? t('approval.editFile', {
            file: basename(String(toolInput.file_path ?? toolInput.notebook_path)),
          })
        : t('approval.useTool', { tool: toolName });

  const always =
    msg.alwaysAllowTarget === 'project'
      ? {
          key: 'project',
          label: t('approval.allowProject'),
          hint: t('approval.allowProjectHint'),
          onSelect: () => resolve('allow_project'),
        }
      : {
          key: 'session',
          label: t('approval.allowSession'),
          hint: t('approval.allowSessionToolHint', { tool: toolName }),
          onSelect: () => resolve('allow_always'),
        };

  return (
    <ApprovalCard
      icon={CATEGORY_ICON[category]}
      kind={kind}
      title={title}
      deny={{ key: 'deny', label: t('approval.deny'), onSelect: () => resolve('deny') }}
      allow={{ key: 'once', label: t('approval.allowOnce'), onSelect: () => resolve('allow') }}
      moreOptions={[always]}
    >
      <PermissionToolBody msg={msg} category={category} />
    </ApprovalCard>
  );
}
