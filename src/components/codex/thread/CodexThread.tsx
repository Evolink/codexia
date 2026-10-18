import { Fragment, type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkSummary } from '@/components/ai-elements/WorkSummary';
import { useCodexStore } from '@/components/codex/stores';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useScrollToBottom } from '../hooks';
import { EventItem } from '../items';
import { ApprovalItem } from '../items/ApprovalItem';
import { ElicitationItem } from '../items/ElicitationItem';
import { PermissionsItem } from '../items/PermissionsItem';
import { RequestUserInputItem } from '../items/RequestUserInputItem';
import { formatStepDuration } from '../items/stepItems';
import { ThreadStepChain } from '../items/ThreadStepChain';
import { ScrollToBottomButton } from '../widget/ScrollToBottomButton';
import { WorkingIndicator } from '../widget/WorkingIndicator';
import { deriveRenderItems, type RenderItem } from './deriveRenderItems';

interface CodexThreadProps {
  /**
   * When provided, renders this specific thread instead of the globally
   * active thread from useCodexStore.
   */
  threadId?: string;
}

export function CodexThread({ threadId }: CodexThreadProps = {}) {
  const { t } = useTranslation('thread');
  const { currentThreadId, events, turnTimingMap, retryNoticeMap } = useCodexStore();

  // Use the explicitly provided threadId when embedded, otherwise fall back
  // to the globally active thread.
  const activeThreadId = threadId ?? currentThreadId;

  // Get events for the active thread
  const currentThreadEvents = activeThreadId ? events[activeThreadId] || [] : [];
  const turnTiming = activeThreadId ? turnTimingMap[activeThreadId] : undefined;
  const retryNotice = activeThreadId ? retryNoticeMap[activeThreadId] : undefined;

  const { scrollAreaRootRef, bottomAnchorRef, isAtBottom, scrollToBottom } =
    useScrollToBottom(currentThreadEvents);

  const renderItems = useMemo(() => deriveRenderItems(currentThreadEvents), [currentThreadEvents]);

  const seenAgentMessageDeltaItemIds = new Set<string>();

  const renderAll = (items: RenderItem[]) => {
    const rendered: Array<{ key: string; content: ReactNode }> = [];
    for (const item of items) {
      if (item.kind === 'chain') {
        rendered.push({ key: item.key, content: <ThreadStepChain steps={item.steps} /> });
        continue;
      }

      if (item.kind === 'turn') {
        const duration =
          item.durationMs !== null && item.durationMs > 0
            ? formatStepDuration(item.durationMs)
            : null;
        const steps = item.stepCount > 0 ? t('items.stepCount', { count: item.stepCount }) : '';
        rendered.push({
          key: item.key,
          content: (
            <WorkSummary
              title={
                duration
                  ? t('items.workedFor', { duration })
                  : item.stepCount > 0
                    ? t('items.stepsDone', { count: item.stepCount })
                    : t('worked')
              }
              description={duration ? steps : undefined}
            >
              {renderAll(item.items).map((entry) => (
                <Fragment key={entry.key}>{entry.content}</Fragment>
              ))}
            </WorkSummary>
          ),
        });
        continue;
      }

      const { event, index } = item;

      if (event.method === 'item/agentMessage/delta') {
        seenAgentMessageDeltaItemIds.add(event.params.itemId);
      }

      if (event.method === 'item/completed') {
        const completedItem = event.params.item;
        if (
          completedItem.type === 'agentMessage' &&
          seenAgentMessageDeltaItemIds.has(completedItem.id)
        ) {
          continue;
        }
      }

      rendered.push({
        key: `event-${index}`,
        content: (
          <EventItem event={event} context={{ events: currentThreadEvents, eventIndex: index }} />
        ),
      });
    }
    return rendered;
  };

  const renderedEvents = renderAll(renderItems);

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full">
      {/* Messages Area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea ref={scrollAreaRootRef} className="h-full px-4 pb-4">
          <div className="thread-surface max-w-3xl mx-auto space-y-2 py-4">
            {renderedEvents.map((entry) => (
              <Fragment key={entry.key}>{entry.content}</Fragment>
            ))}
            <ApprovalItem />
            <WorkingIndicator turnTiming={turnTiming} retryNotice={retryNotice} />
            <RequestUserInputItem currentThreadId={activeThreadId} />
            <ElicitationItem currentThreadId={activeThreadId} />
            <PermissionsItem currentThreadId={activeThreadId} />
            <div ref={bottomAnchorRef} aria-hidden="true" />
          </div>
        </ScrollArea>
      </div>

      {/* Scroll-to-bottom button, shown when the view isn't already at the bottom */}
      {!isAtBottom && (
        <ScrollToBottomButton onClick={() => scrollToBottom('smooth')} bottomClassName="bottom-4" />
      )}
    </div>
  );
}
