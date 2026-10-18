import { useCallback, useRef, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { createAutomation } from '@/services/apiAdapt/automation';
import { type BotPatch, createBot, updateBot } from '@/services/apiAdapt/bots';
import { useLayoutStore } from '@/stores';
import { useAcpStore } from '@/stores/useAcpStore';
import { useBotUiStore } from '@/stores/useBotUiStore';
import { newBotId } from './botDefaults';
import type { BotTemplate } from './botTemplates';

/** What the New bot page collected. Nothing exists until it is created. */
export interface BotDraft {
  /** `null` for a bot described in the person's own words. */
  template: BotTemplate | null;
  name: string;
  /** The role line; empty takes the template's, or one from the description. */
  title: string;
  avatar: string;
  color: string;
  /** A blank bot's job, in the person's words; becomes its instructions. */
  description: string;
  /** Empty: the bot works in a folder of its own. */
  cwd: string;
  servers: string[];
  /** Also create the template's routine. */
  routine: boolean;
}

/** A blank bot's role line: the first sentence of what it should do. */
function roleFrom(description: string) {
  const first =
    description
      .trim()
      .split(/[\n.!?]/)[0]
      ?.trim() ?? '';
  return first.length > 60 ? `${first.slice(0, 57)}…` : first;
}

/** Opens the New bot page and creates the bot once the person confirms it. */
export function useCreateBot() {
  const upsertBot = useBotUiStore((s) => s.upsertBot);
  const setView = useLayoutStore((s) => s.setView);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);

  const openNewBot = useCallback(() => {
    useBotUiStore.getState().setNewBotOpen(true);
    setView('bot');
  }, [setView]);

  const closeNewBot = useCallback(() => useBotUiStore.getState().setNewBotOpen(false), []);

  const create = useCallback(
    async (draft: BotDraft) => {
      if (creatingRef.current) return;
      creatingRef.current = true;
      setCreating(true);
      const { template } = draft;
      try {
        let bot = await createBot({
          id: newBotId(),
          name: draft.name.trim() || template?.name || 'Bot',
          avatar: draft.avatar,
          color: draft.color,
          cwd: draft.cwd,
          trustLevel: template?.trustLevel,
        });
        const patch: BotPatch = {};
        if (template) {
          patch.title = template.title;
          patch.systemPrompt = template.prompt;
        } else if (draft.description.trim()) {
          patch.title = roleFrom(draft.description);
          patch.systemPrompt = draft.description.trim();
        }
        if (draft.title.trim()) patch.title = draft.title.trim();
        if (draft.servers.length) patch.mcpServers = draft.servers;
        if (Object.keys(patch).length) bot = await updateBot(bot.id, patch);
        if (template?.routine && draft.routine) {
          await createAutomation({
            ...template.routine,
            agent: 'bot',
            bot_id: bot.id,
            projects: [],
          });
        }
        upsertBot(bot);
        useAcpStore.getState().reset();
        useAcpStore.getState().setAgentId(bot.agentId);
        useBotUiStore.getState().setSelectedBotId(bot.id);
        useBotUiStore.getState().setNewBotOpen(false);
        setView('bot');
      } catch (error) {
        toast({
          title: 'Could not create bot',
          description: String(error),
          variant: 'destructive',
        });
      } finally {
        creatingRef.current = false;
        setCreating(false);
      }
    },
    [setView, upsertBot]
  );

  return { creating, openNewBot, closeNewBot, create };
}
