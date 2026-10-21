import { cn } from 'cn';
import type { ReactNode } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
  useMessageScrollerVisibility,
} from '@/components/ui/message-scroller';
import { THREAD_COLUMN } from './threadColumn';

/** A user message the navigator can jump to; `id` is its scroller item id. */
export type ThreadTurn = { id: string; text: string };

const preview = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * A rail of user messages at the thread's left edge, shown when the pane is wide
 * enough. The current turn's mark is highlighted; hover lists the messages and a
 * click jumps to one.
 */
export function TurnNavigator({ turns }: { turns: ThreadTurn[] }) {
  const { scrollToMessage } = useMessageScroller();
  const { currentAnchorId } = useMessageScrollerVisibility();

  if (turns.length < 2) return null;

  const jump = (id: string) => scrollToMessage(id, { behavior: 'smooth' });

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <nav
          aria-label="User messages"
          className="no-scrollbar absolute top-1/2 left-3 z-10 hidden max-h-[60%] -translate-y-1/2 flex-col overflow-y-auto py-1 @5xl/thread:flex"
        >
          {turns.map((turn) => {
            const active = turn.id === currentAnchorId;
            return (
              <button
                key={turn.id}
                type="button"
                aria-label={preview(turn.text)}
                aria-current={active ? 'true' : undefined}
                onClick={() => jump(turn.id)}
                className="group/turn flex h-3 w-6 shrink-0 cursor-pointer items-center outline-none"
              >
                <span
                  className={cn(
                    'h-0.5 rounded-full transition-all duration-300',
                    active
                      ? 'w-5 bg-foreground shadow-[0_0_6px] shadow-foreground/40'
                      : 'w-3 bg-muted-foreground/60 group-hover/turn:w-4 group-hover/turn:bg-muted-foreground group-focus-visible/turn:bg-muted-foreground'
                  )}
                />
              </button>
            );
          })}
        </nav>
      </HoverCardTrigger>
      <HoverCardContent side="right" align="center" className="w-72 p-1">
        <div className="no-scrollbar flex max-h-80 flex-col overflow-y-auto">
          {turns.map((turn) => (
            <button
              key={turn.id}
              type="button"
              onClick={() => jump(turn.id)}
              className={cn(
                'truncate rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                turn.id === currentAnchorId && 'font-medium text-foreground'
              )}
            >
              {preview(turn.text)}
            </button>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

type ThreadScrollerProps = {
  /** User messages for the navigator rail, in order. */
  turns: ThreadTurn[];
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Show the jump-to-latest button. */
  jumpButton?: boolean;
};

/**
 * The scrolling message area of a thread: follows streaming output while the
 * reader is at the bottom, anchors each new user turn, and offers a turn rail
 * and a jump-to-latest button. Children must be `MessageScrollerItem` rows.
 */
export function ThreadScroller({
  turns,
  children,
  className,
  contentClassName,
  jumpButton = true,
}: ThreadScrollerProps) {
  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className={cn('@container/thread', className)}>
        <MessageScrollerViewport>
          <MessageScrollerContent
            className={cn(THREAD_COLUMN, 'gap-2 py-4 *:empty:hidden', contentClassName)}
          >
            {children}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <TurnNavigator turns={turns} />
        {jumpButton && <MessageScrollerButton />}
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
