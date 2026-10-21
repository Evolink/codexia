import { ChevronRight, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ItemGuardianApprovalReviewCompletedNotification } from '@/bindings/v2';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { reviewActionSummary } from './autoReview';

/** A denied or timed-out auto-review: one line, with the reviewer's rationale on demand. */
export function AutoReviewDecisionItem({
  params,
}: {
  params: ItemGuardianApprovalReviewCompletedNotification;
}) {
  const { t } = useTranslation('thread');
  const { review, action } = params;
  const label = review.status === 'timedOut' ? t('autoReview.timedOut') : t('autoReview.denied');
  const summary = reviewActionSummary(action, t);
  const rationale = review.rationale?.trim();

  const line = (
    <span className="flex min-w-0 items-center gap-1.5">
      <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
      <span className="shrink-0 font-medium text-foreground">{label}</span>
      <code className="truncate">{summary}</code>
    </span>
  );

  if (!rationale) {
    return <div className="text-xs text-muted-foreground">{line}</div>;
  }

  return (
    <Collapsible className="text-xs text-muted-foreground">
      <CollapsibleTrigger className="group flex w-full min-w-0 items-center gap-1 text-left">
        {line}
        <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 pl-5 whitespace-pre-wrap">{rationale}</CollapsibleContent>
    </Collapsible>
  );
}
