import { Fragment, type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Streamdown } from 'streamdown';
import { ChainOfThought } from '@/components/ai-elements/ChainOfThought';
import { WorkSummary } from '@/components/ai-elements/WorkSummary';
import { formatStepDuration } from '@/components/codex/items/stepItems';
import { AddToTodo, CopyButton } from '@/components/common';
import { Trace } from '@/components/ui/trace';
import type { CCMessage } from '../../types/messages';
import { AskUserQuestionCard } from '../messages/tool-use/AskUserQuestionCard';
import { UserMessage } from '../messages/UserMessage';
import { buildCCTranscript, type CCRenderItem, type CCStep } from './buildCCTranscript';
import { CCToolStep } from './CCToolStep';
import { isStepFailed } from './stepText';

interface CCTranscriptProps {
  messages: CCMessage[];
  isLoading: boolean;
  showThinking: boolean;
  /** Renders a message shown as-is (permission request, session init, rate limit). */
  renderMessage: (index: number) => ReactNode;
}

function CCAssistantText({ text }: { text: string }) {
  return (
    <div className="group flex items-start gap-1">
      <div className="invisible flex shrink-0 flex-col gap-0.5 pt-0.5 group-hover:visible">
        <CopyButton text={text} className="h-4 w-4 text-muted-foreground" />
        <AddToTodo text={text} className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <Streamdown>{text}</Streamdown>
      </div>
    </div>
  );
}

function CCStepChain({ steps, running }: { steps: CCStep[]; running: boolean }) {
  const { t } = useTranslation('thread');
  const rows = steps.map((step) => <CCToolStep key={step.key} step={step} />);

  if (steps.length === 1) return <Trace>{rows}</Trace>;

  const failed = steps.filter(isStepFailed).length;
  const title = running
    ? t('items.stepsRunning')
    : [
        t('items.stepsDone', { count: steps.length }),
        failed > 0 ? t('items.stepsFailed', { count: failed }) : null,
      ]
        .filter(Boolean)
        .join(', ');

  return (
    <ChainOfThought title={title} running={running} failed={failed > 0}>
      {rows}
    </ChainOfThought>
  );
}

/**
 * The Claude Code transcript as trace lines: steps chain together, sub-agent work
 * nests under its call, and a finished turn folds its work above the final reply.
 */
export function CCTranscript({
  messages,
  isLoading,
  showThinking,
  renderMessage,
}: CCTranscriptProps) {
  const { t } = useTranslation('thread');
  const items = useMemo(
    () => buildCCTranscript(messages, isLoading, { showThinking }),
    [messages, isLoading, showThinking]
  );

  const renderItem = (item: CCRenderItem): ReactNode => {
    switch (item.kind) {
      case 'user':
        return <UserMessage text={item.text} />;
      case 'text':
        return <CCAssistantText text={item.text} />;
      case 'error':
        return <p className="text-sm text-destructive">{item.text}</p>;
      case 'steps':
        return <CCStepChain steps={item.steps} running={item.running} />;
      case 'question':
        return <AskUserQuestionCard block={item.block} />;
      case 'message':
        return renderMessage(item.index);
      case 'turn': {
        const { result, stepCount } = item;
        const duration =
          result && result.duration_ms > 0 ? formatStepDuration(result.duration_ms) : null;
        const description = [
          duration ? t('items.stepCount', { count: stepCount }) : null,
          result?.total_cost_usd ? `$${result.total_cost_usd.toFixed(4)}` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <WorkSummary
            title={
              duration
                ? t('items.workedFor', { duration })
                : t('items.stepsDone', { count: stepCount })
            }
            description={description || undefined}
          >
            {item.items.map((child) => (
              <Fragment key={child.key}>{renderItem(child)}</Fragment>
            ))}
          </WorkSummary>
        );
      }
    }
  };

  return items.map((item) => <Fragment key={item.key}>{renderItem(item)}</Fragment>);
}
