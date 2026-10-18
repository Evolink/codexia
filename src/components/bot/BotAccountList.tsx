import { Check, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AcpAuthMethod } from '@/services/apiAdapt/acp';
import { providerIcon } from './botIcons';

interface BotAccountListProps {
  accounts: AcpAuthMethod[];
  /** The account currently chosen, if any. */
  selected?: string;
  /** Rejects with the reason the account could not be used. */
  onChoose: (id: string, apiKey?: string) => Promise<void>;
}

function AccountIcon({ method }: { method: AcpAuthMethod }) {
  const icon = providerIcon(method.id, method.name);
  return icon ? (
    <img src={icon} alt="" className="size-5 object-contain" />
  ) : (
    <span className="flex size-5 items-center justify-center rounded bg-muted text-xs uppercase">
      {method.name.slice(0, 1)}
    </span>
  );
}

/** What choosing the account takes, in the row's own words. */
function statusOf(method: AcpAuthMethod) {
  const meta = method._meta;
  if (meta?.apiKeyVar) return meta.signedIn ? 'Key set' : 'Add API key';
  if (meta?.signedIn === false) return 'Sign in';
  return meta?.credentialSource ? 'Signed in' : 'Ready';
}

/**
 * keke's accounts, each labelled by what it takes: a login (keke opens the
 * browser), an API key (asked for inline), or nothing (a local server).
 */
export function BotAccountList({ accounts, selected, onChoose }: BotAccountListProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [keyFor, setKeyFor] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const choose = async (id: string, key?: string) => {
    setBusy(id);
    setError(null);
    try {
      await onChoose(id, key);
      setKeyFor(null);
      setApiKey('');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border" aria-label="AI accounts">
        {accounts.map((method) => {
          const needsKey = Boolean(method._meta?.apiKeyVar) && method._meta?.signedIn === false;
          return (
            <li key={method.id}>
              <button
                type="button"
                aria-pressed={selected === method.id}
                disabled={busy !== null}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted disabled:opacity-60"
                onClick={() => {
                  setError(null);
                  if (needsKey) setKeyFor(keyFor === method.id ? null : method.id);
                  else void choose(method.id);
                }}
              >
                <AccountIcon method={method} />
                <span className="flex-1 font-medium">{method.name}</span>
                {busy === method.id ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : selected === method.id ? (
                  <Check className="size-4 text-primary" />
                ) : (
                  <span className="text-xs text-muted-foreground">{statusOf(method)}</span>
                )}
              </button>
              {keyFor === method.id && (
                <form
                  className="flex gap-2 px-3 pb-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (apiKey.trim()) void choose(method.id, apiKey.trim());
                  }}
                >
                  <Input
                    type="password"
                    autoFocus
                    autoComplete="off"
                    aria-label={`${method.name} API key`}
                    placeholder={method._meta?.apiKeyVar}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <Button type="submit" disabled={!apiKey.trim() || busy !== null}>
                    Save
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
