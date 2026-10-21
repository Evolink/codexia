import {
  FilePenIcon,
  FilePlusIcon,
  FileTextIcon,
  GlobeIcon,
  SearchIcon,
  WrenchIcon,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CodeOutput } from '@/components/ai-elements/CodeOutput';
import { Plan, type PlanStepData } from '@/components/ai-elements/Plan';
import { Reasoning } from '@/components/ai-elements/Reasoning';
import { Subagent } from '@/components/ai-elements/Subagent';
import { Terminal } from '@/components/ai-elements/Terminal';
import { Tool } from '@/components/ai-elements/Tool';
import { Markdown } from '@/components/Markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trace } from '@/components/ui/trace';
import { DiffMessage } from '../messages/DiffMessage';
import type { CCStep } from './buildCCTranscript';
import { hasToolDetails, isStepFailed, resultText, splitToolName, stepTitle } from './stepText';

type ToolStep = Extract<CCStep, { kind: 'tool' }>;

const TODO_STATUS: Record<string, PlanStepData['status']> = {
  completed: 'done',
  in_progress: 'running',
  pending: 'pending',
};

const TOOL_ICONS: Record<string, ReactNode> = {
  Read: <FileTextIcon />,
  Grep: <SearchIcon />,
  Glob: <SearchIcon />,
  Edit: <FilePenIcon />,
  MultiEdit: <FilePenIcon />,
  NotebookEdit: <FilePenIcon />,
  Write: <FilePlusIcon />,
  WebFetch: <GlobeIcon />,
  WebSearch: <GlobeIcon />,
};

// A sub-agent's middle steps fold away once it has more than this many.
const SUBAGENT_VISIBLE_STEPS = 6;

const stepStatus = (step: ToolStep) =>
  step.running ? 'running' : isStepFailed(step) ? 'error' : undefined;

function CCSubagentSteps({ steps }: { steps: CCStep[] }) {
  const { t } = useTranslation('thread');
  const [showAll, setShowAll] = useState(false);

  // Keep the first and last steps; fold the middle into one "N more steps" button.
  const folded = !showAll && steps.length > SUBAGENT_VISIBLE_STEPS;
  const head = folded ? steps.slice(0, 2) : steps;
  const tail = folded ? steps.slice(-(SUBAGENT_VISIBLE_STEPS - 2)) : [];

  return (
    <Trace>
      {head.map((child) => (
        <CCToolStep key={child.key} step={child} />
      ))}
      {folded && (
        <Button
          variant="ghost"
          size="sm"
          className="h-auto w-fit px-0 text-muted-foreground"
          onClick={() => setShowAll(true)}
        >
          {t('items.moreSteps', { count: steps.length - head.length - tail.length })}
        </Button>
      )}
      {tail.map((child) => (
        <CCToolStep key={child.key} step={child} />
      ))}
    </Trace>
  );
}

function CCSubagent({ step }: { step: ToolStep }) {
  const { t } = useTranslation('thread');
  const input = step.block.input ?? {};
  const report = resultText(step.result);
  const failed = isStepFailed(step);
  const current = step.running ? step.children[step.children.length - 1] : undefined;

  return (
    <Subagent
      title={stepTitle(step, t)}
      description={current ? stepTitle(current, t) : String(input.description ?? '')}
      state={step.running ? 'running' : failed ? 'error' : 'done'}
    >
      {input.prompt ? (
        <p className="line-clamp-4 whitespace-pre-wrap">{String(input.prompt)}</p>
      ) : null}
      {input.model ? (
        <div>
          <Badge variant="secondary">{String(input.model)}</Badge>
        </div>
      ) : null}
      {step.children.length > 0 && <CCSubagentSteps steps={step.children} />}
      {report && failed && <CodeOutput code={report} language="text" variant="destructive" />}
      {report && !failed && <Markdown value={report} className="text-sm text-foreground" />}
    </Subagent>
  );
}

function CCTodoPlan({ step }: { step: ToolStep }) {
  const { t } = useTranslation('thread');
  const todos: Array<{ content: string; activeForm?: string; status: string }> = Array.isArray(
    step.block.input?.todos
  )
    ? step.block.input.todos
    : [];
  const done = todos.filter((todo) => todo.status === 'completed').length;

  return (
    <Plan
      title={t('plan.label')}
      description={t('items.planProgress', { done, total: todos.length })}
      steps={todos.map((todo) => ({
        title: todo.status === 'in_progress' ? todo.activeForm || todo.content : todo.content,
        status: TODO_STATUS[todo.status] ?? 'pending',
      }))}
      running={step.running}
    />
  );
}

function CCMultiEdit({ step }: { step: ToolStep }) {
  // Edits are a fixed list without ids; position is their identity.
  const edits: Array<{ id: string; old_string?: string; new_string?: string }> = (
    Array.isArray(step.block.input?.edits) ? step.block.input.edits : []
  ).map((edit: object, i: number) => ({ ...edit, id: `${step.block.id}-${i}` }));
  return edits.map((edit) => (
    <DiffMessage
      key={edit.id}
      oldString={edit.old_string ?? ''}
      newString={edit.new_string ?? ''}
    />
  ));
}

function CCToolArgs({ input, output }: { input: Record<string, unknown>; output: string }) {
  const args = JSON.stringify(input, null, 2);
  return (
    <>
      {args !== '{}' && <CodeOutput code={args} language="json" />}
      {output && <CodeOutput code={output} language="text" />}
    </>
  );
}

/**
 * What a call opens onto: diffs for edits, output for searches, args otherwise.
 * Rendered only when `hasToolDetails` says there is something to show.
 */
function CCToolDetails({ step }: { step: ToolStep }) {
  const input = step.block.input ?? {};
  const output = isStepFailed(step) ? '' : resultText(step.result);

  switch (step.block.name) {
    case 'Edit':
      return (
        <DiffMessage
          oldString={String(input.old_string ?? '')}
          newString={String(input.new_string ?? '')}
        />
      );
    case 'MultiEdit':
      return <CCMultiEdit step={step} />;
    case 'Write':
      return <CodeOutput code={String(input.content)} language="text" />;
    case 'Grep':
    case 'Glob':
      return <CodeOutput code={output} language="text" />;
    case 'WebFetch':
    case 'WebSearch':
      return <Markdown value={output} className="text-sm" />;
    default:
      return <CCToolArgs input={input} output={output} />;
  }
}

/** Last two path segments, enough to tell search scopes apart on one line. */
function shortPath(path: unknown): string | undefined {
  if (typeof path !== 'string' || !path) return undefined;
  return path.replace(/\\/g, '/').split('/').filter(Boolean).slice(-2).join('/');
}

function CCGenericTool({ step }: { step: ToolStep }) {
  const { t } = useTranslation('thread');
  const { block } = step;
  const failed = isStepFailed(step);
  const error = failed ? resultText(step.result) : '';
  const hasDetails = hasToolDetails(step) || !!error;
  const description =
    block.name === 'Grep' || block.name === 'Glob'
      ? shortPath(block.input?.path)
      : (splitToolName(block.name).server ?? undefined);

  return (
    <Tool
      icon={TOOL_ICONS[block.name] ?? <WrenchIcon />}
      title={stepTitle(step, t)}
      description={description}
      status={stepStatus(step)}
    >
      {hasDetails ? (
        <div className="flex flex-col gap-2">
          {hasToolDetails(step) && <CCToolDetails step={step} />}
          {error && <CodeOutput code={error} language="text" variant="destructive" />}
        </div>
      ) : null}
    </Tool>
  );
}

/** One Claude Code step (a thought or a tool call) as a trace line. */
export function CCToolStep({ step }: { step: CCStep }) {
  const { t } = useTranslation('thread');

  if (step.kind === 'thinking') {
    return <Reasoning title={t('items.thinking')} text={step.text} />;
  }
  if (step.kind === 'text') {
    return <Markdown value={step.text} className="text-sm text-muted-foreground" />;
  }

  switch (step.block.name) {
    case 'Bash': {
      const input = step.block.input ?? {};
      return (
        <Terminal
          command={String(input.command ?? '')}
          title={stepTitle(step, t)}
          description={input.description ? String(input.description) : undefined}
          status={stepStatus(step)}
          output={resultText(step.result) || null}
        />
      );
    }
    case 'Task':
    case 'Agent':
      return <CCSubagent step={step} />;
    case 'TodoWrite':
      return <CCTodoPlan step={step} />;
    default:
      return <CCGenericTool step={step} />;
  }
}
