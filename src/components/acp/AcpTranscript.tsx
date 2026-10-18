import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChainOfThought } from '@/components/ai-elements/ChainOfThought';
import { Reasoning } from '@/components/ai-elements/Reasoning';
import { WorkSummary } from '@/components/ai-elements/WorkSummary';
import { MessageScrollerItem } from '@/components/ui/message-scroller';
import { Trace } from '@/components/ui/trace';
import type { AcpEntry } from '@/stores/useAcpStore';
import { AcpToolCall } from './AcpToolCall';
import type { AcpRenderItem, AcpStepEntry } from './transcript';

type MessageEntry = Exclude<AcpEntry, AcpStepEntry>;

interface AcpTranscriptProps {
  /** Built with `buildAcpTranscript`. */
  items: AcpRenderItem[];
  /** Renders a user, agent or error entry; steps and folds are handled here. */
  renderEntry: (entry: MessageEntry) => ReactNode;
  /** Wraps step rows, e.g. to indent them under a bubble layout. */
  stepsClassName?: string;
}

function AcpStepChain({ steps, running }: { steps: AcpStepEntry[]; running: boolean }) {
  const { t } = useTranslation('thread');

  const rows = steps.map((step, index) =>
    step.role === 'tool' ? (
      <AcpToolCall key={step.id} entry={step} />
    ) : (
      <Reasoning
        key={step.id}
        title={t('items.thinking')}
        text={step.text}
        running={running && index === steps.length - 1}
      />
    )
  );

  if (steps.length === 1) return <Trace>{rows}</Trace>;

  const failed = steps.filter((step) => step.role === 'tool' && step.status === 'failed').length;
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
 * The ACP transcript as trace lines: consecutive tool calls and thoughts form a
 * chain, and a finished turn folds its work above the final reply. Each top-level
 * row is a scroller item; user messages anchor their turn.
 */
export function AcpTranscript({ items, renderEntry, stepsClassName }: AcpTranscriptProps) {
  const { t } = useTranslation('thread');

  // Rows inside a fold are already indented by it.
  const renderItem = (item: AcpRenderItem, nested = false): ReactNode => {
    if (item.kind === 'entry') return renderEntry(item.entry);
    if (item.kind === 'chain') {
      return (
        <div className={nested ? undefined : stepsClassName}>
          <AcpStepChain steps={item.steps} running={item.running} />
        </div>
      );
    }
    return (
      <div className={stepsClassName}>
        <WorkSummary
          title={item.stepCount > 0 ? t('items.stepsDone', { count: item.stepCount }) : t('worked')}
        >
          {item.items.map((child) => (
            <Fragment key={keyOf(child)}>{renderItem(child, true)}</Fragment>
          ))}
        </WorkSummary>
      </div>
    );
  };

  return items.map((item) => (
    <MessageScrollerItem
      key={keyOf(item)}
      messageId={keyOf(item)}
      scrollAnchor={item.kind === 'entry' && item.entry.role === 'user'}
    >
      {renderItem(item)}
    </MessageScrollerItem>
  ));
}

function keyOf(item: AcpRenderItem): string {
  return item.kind === 'entry' ? item.entry.id : item.key;
}
