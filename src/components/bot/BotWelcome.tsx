import { Loader2, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import kekeStatic from '@/assets/keke/keke.webp';
import kekeWave from '@/assets/keke/keke-wave.webp';
import { Button } from '@/components/ui/button';
import { useBotOptionsStore } from '@/stores/useBotOptionsStore';
import { BotAccountList } from './BotAccountList';
import { chooseDefaultAccount, probeAccounts } from './probeProviderModels';

interface BotWelcomeProps {
  creating: boolean;
  onCreate: () => void;
}

/**
 * The Bot tab before any bot exists: choose the AI account bots run on, then
 * create the first one. The model is that account's default; there is no
 * model picker. Once a bot exists, Today takes over.
 */
export function BotWelcome({ creating, onCreate }: BotWelcomeProps) {
  const accounts = useBotOptionsStore((s) => s.authMethods);
  const chosen = useBotOptionsStore((s) => s.defaultAccount);
  const [listing, setListing] = useState(accounts.length === 0);

  // keke reports its accounts over a live connection only.
  useEffect(() => {
    let cancelled = false;
    probeAccounts()
      .catch((e) => console.warn('bot: could not list accounts', e))
      .finally(() => {
        if (!cancelled) setListing(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // With no account list (keke missing or failing to start), creating stays
  // possible: the bot's chat explains what to install.
  const ready = Boolean(chosen) || (!listing && accounts.length === 0);

  return (
    <div className="flex flex-1 min-h-0 overflow-y-auto px-6 py-10">
      <div className="m-auto w-full max-w-lg space-y-6">
        <div className="space-y-2 text-center">
          <picture>
            <source srcSet={kekeStatic} media="(prefers-reduced-motion: reduce)" />
            <img
              src={kekeWave}
              alt=""
              aria-hidden="true"
              className="mx-auto mb-4 h-28 w-28 select-none"
            />
          </picture>
          <h1 className="text-2xl font-semibold tracking-tight">Create your first bot</h1>
          <p className="text-sm text-muted-foreground">
            {accounts.length > 0
              ? 'Choose the AI account your bots work with.'
              : 'Give it a role, then start a conversation.'}
          </p>
        </div>

        {listing && accounts.length === 0 && (
          <div className="flex justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-label="Loading accounts" />
          </div>
        )}

        {accounts.length > 0 && (
          <BotAccountList accounts={accounts} selected={chosen} onChoose={chooseDefaultAccount} />
        )}

        <div className="flex justify-center">
          <Button disabled={creating || !ready} onClick={onCreate}>
            <Plus className="h-4 w-4" />
            {creating ? 'Creating…' : 'Create bot'}
          </Button>
        </div>
      </div>
    </div>
  );
}
