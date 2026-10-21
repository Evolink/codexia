import { Activity, Square } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AgentLogo } from '@/components/agent/AgentLogo';
import { type CardActivity, useCardActivity } from '@/components/agent/useCardActivity';
import { getCodexActiveTurnId } from '@/components/agent/utils';
import { useCodexStore } from '@/components/codex/stores';
import { Button } from '@/components/ui/button';
import { useCCSessionManager } from '@/hooks/useCCSessionManager';
import { cn } from '@/lib/utils';
import { ccInterrupt } from '@/services/apiAdapt/cc';
import { codexService } from '@/services/codexService';
import { useAgentCenterStore, useLayoutStore } from '@/stores';
import type { AgentCenterCard } from '@/stores/useAgentCenterStore';
import { useAgentSettingsStore } from '@/stores/useAgentSettingsStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { getFilename } from '@/utils/getFilename';
import { SideBarSection } from './SideBarSection';

const GROUPS: { activity: Exclude<CardActivity, 'idle'>; label: string }[] = [
  { activity: 'pending', label: 'Needs input' },
  { activity: 'running', label: 'Running' },
];

async function stopCard(card: AgentCenterCard) {
  if (card.kind === 'cc') {
    await ccInterrupt(card.id);
    return;
  }
  const turnId = getCodexActiveTurnId(useCodexStore.getState().turnTimingMap[card.id]);
  if (turnId) await codexService.turnInterrupt(card.id, turnId);
}

interface ActiveRowProps {
  card: AgentCenterCard;
  activity: Exclude<CardActivity, 'idle'>;
  selected: boolean;
  onOpen: () => void;
}

function ActiveRow({ card, activity, selected, onOpen }: ActiveRowProps) {
  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-md pr-1 hover:bg-accent/50',
        selected && 'bg-accent/60'
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        title={card.cwd ?? undefined}
        className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1 text-left"
      >
        <span
          aria-hidden
          className={cn(
            'size-1.5 shrink-0 animate-pulse rounded-full',
            activity === 'pending' ? 'bg-amber-500' : 'bg-green-500'
          )}
        />
        <AgentLogo id={card.kind} className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-xs">
          {card.preview?.slice(0, 80) || 'Untitled'}
        </span>
        {card.cwd && (
          <span className="shrink-0 text-[10px] text-muted-foreground group-hover:hidden">
            {getFilename(card.cwd)}
          </span>
        )}
      </button>
      {activity === 'running' && (
        <Button
          variant="ghost"
          size="icon-xs"
          title="Stop"
          aria-label="Stop"
          className="hidden shrink-0 group-hover:inline-flex"
          onClick={() => void stopCard(card)}
        >
          <Square className="text-destructive" />
        </Button>
      )}
    </div>
  );
}

/** Threads and sessions of every agent that are working or waiting on the user. */
export function SideBarActiveSessions() {
  const cards = useAgentCenterStore((s) => s.cards);
  const currentAgentCardId = useAgentCenterStore((s) => s.currentAgentCardId);
  const setCurrentAgentCardId = useAgentCenterStore((s) => s.setCurrentAgentCardId);
  const setSelectedAgent = useAgentSettingsStore((s) => s.setSelectedAgent);
  const setCwd = useWorkspaceStore((s) => s.setCwd);
  const setView = useLayoutStore((s) => s.setView);
  const setActiveSidebarTab = useLayoutStore((s) => s.setActiveSidebarTab);
  const { handleSessionSelect } = useCCSessionManager();
  const activityOf = useCardActivity();
  const [open, setOpen] = useState(true);

  const groups = useMemo(
    () =>
      GROUPS.map(({ activity, label }) => ({
        activity,
        label,
        cards: cards.filter((card) => activityOf(card) === activity),
      })).filter((group) => group.cards.length > 0),
    [cards, activityOf]
  );

  if (groups.length === 0) return null;

  const openCard = async (card: AgentCenterCard) => {
    if (card.cwd) setCwd(card.cwd);
    setCurrentAgentCardId(card.id);
    setSelectedAgent(card.kind);
    setActiveSidebarTab(card.kind);
    setView('agent');
    if (card.kind === 'codex') await codexService.setCurrentThread(card.id);
    else await handleSessionSelect(card.id, card.cwd ?? undefined);
  };

  return (
    <SideBarSection icon={<Activity />} title="Active" open={open} onOpenChange={setOpen}>
      {groups.map((group) => (
        <div key={group.activity} className="pb-1">
          <div className="px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
            {group.label}
          </div>
          {group.cards.map((card) => (
            <ActiveRow
              key={`${card.kind}-${card.id}`}
              card={card}
              activity={group.activity}
              selected={card.id === currentAgentCardId}
              onOpen={() => void openCard(card)}
            />
          ))}
        </div>
      ))}
    </SideBarSection>
  );
}
