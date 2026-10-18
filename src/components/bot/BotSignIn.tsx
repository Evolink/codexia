import { KeyRound } from 'lucide-react';
import { type AcpAuthMethod, acpAuthenticate, acpNewSession } from '@/services/apiAdapt/acp';
import type { Bot } from '@/services/apiAdapt/bots';
import { useAcpStore } from '@/stores/useAcpStore';
import { useBotUiStore } from '@/stores/useBotUiStore';
import { BotAccountList } from './BotAccountList';

/**
 * Shown in the composer's place when the bot's agent started but no account
 * it can use is signed in: every route keke reports, each labelled by what it
 * takes (a login or an API key).
 */
export function BotSignIn({
  bot,
  connectionId,
  methods,
}: {
  bot: Bot;
  connectionId: string;
  methods: AcpAuthMethod[];
}) {
  const choose = async (methodId: string, apiKey?: string) => {
    await acpAuthenticate(connectionId, methodId, { apiKey });
    // An empty folder lets the backend pick the bot's own workspace.
    const session = await acpNewSession(connectionId, bot.cwd);
    if (useBotUiStore.getState().selectedBotId !== bot.id) return;
    const store = useAcpStore.getState();
    store.setEntries([]);
    store.applySession(session);
    if (session.sessionId) useBotUiStore.getState().setBotSession(bot.id, session.sessionId);
  };

  return (
    <div className="shrink-0 border-t bg-background p-3">
      <div className="space-y-3 rounded-2xl border border-dashed px-3 py-3 text-sm">
        <div className="flex items-center gap-3">
          <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 text-muted-foreground">
            Choose an AI account so {bot.name} can work.
          </span>
        </div>
        <BotAccountList accounts={methods} onChoose={choose} />
      </div>
    </div>
  );
}
