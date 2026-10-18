import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AcpAuthMethod } from '@/services/apiAdapt/acp';
import { type ProviderCatalogue, useBotOptionsStore } from '@/stores/useBotOptionsStore';
import { providerIcon } from './botIcons';
import { probeAccounts, probeProviderModels } from './probeProviderModels';

const SEP = '\u0000';

interface BotModelPickerProps {
  provider: string;
  model: string;
  reasoningEffort: string;
  onChange: (next: { provider: string; model: string; reasoningEffort: string }) => void;
}

/** keke offers models as a `model` config option or as the older `models` list. */
function modelsOf(catalogue: ProviderCatalogue | undefined) {
  const option = catalogue?.configOptions.find(
    (o) => o.category === 'model' || o.category === 'model_config'
  );
  if (option) return (option.options ?? []).map((o) => ({ id: o.value, name: o.name }));
  return (catalogue?.models?.availableModels ?? []).map((m) => ({ id: m.modelId, name: m.name }));
}

/** Efforts come from a `thought_level` option, or from the picked model itself. */
function effortsOf(catalogue: ProviderCatalogue | undefined, model: string) {
  const option = catalogue?.configOptions.find((o) => o.category === 'thought_level');
  if (option) return (option.options ?? []).map((o) => ({ id: o.value, name: o.name }));
  const efforts =
    catalogue?.models?.availableModels.find((m) => m.modelId === model)?._meta?.reasoningEfforts ??
    [];
  return efforts.map((e) => ({ id: e.id, name: (e.label ?? e.id).replace(/\s*effort$/i, '') }));
}

function AccountLabel({ method }: { method: AcpAuthMethod }) {
  const icon = providerIcon(method.id, method.name);
  return (
    <span className="flex items-center gap-2">
      {icon ? (
        <img src={icon} alt="" className="size-4 object-contain" />
      ) : (
        <span className="flex size-4 items-center justify-center rounded bg-muted text-[10px] uppercase">
          {method.name.slice(0, 1)}
        </span>
      )}
      {method.name}
    </span>
  );
}

/**
 * One model menu, grouped by the accounts the person is signed in to. Left
 * empty, the bot uses keke's default on a signed-in account; signing in to
 * another account happens in the bot's chat, not here.
 */
export function BotModelPicker({
  provider,
  model,
  reasoningEffort,
  onChange,
}: BotModelPickerProps) {
  const authMethods = useBotOptionsStore((s) => s.authMethods);
  const byProvider = useBotOptionsStore((s) => s.byProvider);
  const [loading, setLoading] = useState(false);
  const probed = useRef(new Set<string>());

  const accounts = authMethods.filter((m) => m._meta?.signedIn !== false);

  // keke only reports its accounts over a live connection; ask it once when
  // no bot has run yet.
  useEffect(() => {
    if (authMethods.length > 0 || probed.current.has('')) return;
    probed.current.add('');
    probeAccounts().catch((e) => console.warn('bot: could not list accounts', e));
  }, [authMethods.length]);

  // Models are listed per account, so an account no bot has used yet is asked
  // when the menu opens.
  const loadModels = async () => {
    const missing = accounts.filter(
      (a) => modelsOf(byProvider[a.id]).length === 0 && !probed.current.has(a.id)
    );
    if (!missing.length) return;
    setLoading(true);
    for (const account of missing) {
      probed.current.add(account.id);
      await probeProviderModels(account.id, '').catch((e) =>
        console.warn(`bot: could not list models for ${account.id}`, e)
      );
    }
    setLoading(false);
  };

  const efforts = provider && model ? effortsOf(byProvider[provider], model) : [];
  const current = provider && model ? `${provider}${SEP}${model}` : '';

  if (!accounts.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Sign in from the bot&apos;s chat to choose a model.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={current}
        onOpenChange={(open) => {
          if (open) void loadModels();
        }}
        onValueChange={(value) => {
          const [nextProvider, nextModel] = value.split(SEP);
          // A model switch can invalidate the previous effort level.
          onChange({ provider: nextProvider, model: nextModel, reasoningEffort: '' });
        }}
      >
        <SelectTrigger aria-label="Model" className="w-auto min-w-48">
          <SelectValue placeholder="Default" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((account) => {
            const models = modelsOf(byProvider[account.id]);
            return (
              <SelectGroup key={account.id}>
                <SelectLabel>
                  <AccountLabel method={account} />
                </SelectLabel>
                {models.map((m) => (
                  <SelectItem key={m.id} value={`${account.id}${SEP}${m.id}`}>
                    {m.name}
                  </SelectItem>
                ))}
                {models.length === 0 && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    {loading ? 'Loading…' : 'No models listed'}
                  </p>
                )}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>

      {efforts.length > 0 && (
        <Select
          value={reasoningEffort}
          onValueChange={(value) => onChange({ provider, model, reasoningEffort: value })}
        >
          <SelectTrigger aria-label="Reasoning" className="w-auto min-w-28">
            <SelectValue placeholder="Reasoning" />
          </SelectTrigger>
          <SelectContent>
            {efforts.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {(provider || model) && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Use the default model"
          title="Use the default model"
          onClick={() => onChange({ provider: '', model: '', reasoningEffort: '' })}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
