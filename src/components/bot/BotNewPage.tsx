import { ArrowLeft, CalendarClock, Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { appPresets } from '@/features/mcp/appPresets';
import { KekeGitHubAuthDialog } from '@/features/mcp/KekeGitHubAuthDialog';
import { useKekeMcpAuth } from '@/features/mcp/useKekeMcpAuth';
import {
  addKekeMcpServer,
  type KekeMcpAuthStatus,
  readKekeMcpServers,
} from '@/services/apiAdapt/kekeMcp';
import { useBotUiStore } from '@/stores/useBotUiStore';
import { BotIdentityFields } from './BotIdentityFields';
import { defaultLook } from './botDefaults';
import { INTEGRATION_ICONS } from './botIcons';
import {
  BOT_TEMPLATES,
  type BotTemplate,
  matchingServers,
  scheduleLabel,
  TEMPLATE_GROUPS,
  type TemplateNeed,
  templateServers,
} from './botTemplates';
import type { BotDraft } from './useCreateBot';

interface BotNewPageProps {
  creating: boolean;
  onClose: () => void;
  onCreate: (draft: BotDraft) => void;
}

/** The configured keke MCP servers, `null` until read; `reload` re-reads them. */
function useKekeServers() {
  const [servers, setServers] = useState<string[] | null>(null);
  const [revision, setRevision] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `revision` re-runs the read on reload
  useEffect(() => {
    let cancelled = false;
    readKekeMcpServers()
      .then((configured) => {
        if (!cancelled)
          setServers(
            Object.entries(configured)
              .filter(([, config]) => !config.disabled)
              .map(([name]) => name)
          );
      })
      .catch(() => {
        if (!cancelled) setServers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);
  return { servers, reload: () => setRevision((n) => n + 1) };
}

function NeedIcon({ need, connected }: { need: TemplateNeed; connected: boolean }) {
  return (
    <img
      src={INTEGRATION_ICONS[need.icon]}
      alt=""
      className={`size-4 object-contain ${connected ? '' : 'opacity-40 grayscale'}`}
    />
  );
}

/** Connected means configured and, where the server needs a sign-in, signed in. */
function needConnected(
  need: TemplateNeed,
  servers: string[] | null,
  statuses: Record<string, KekeMcpAuthStatus>
) {
  if (servers === null) return false;
  return matchingServers(need, servers).some((name) => {
    const status = statuses[name];
    if (status) return status.signedIn;
    return !appPresets.find((p) => p.name === name)?.authorizationRequired;
  });
}

/**
 * New bot, in two steps: say what it should take care of (or pick a role),
 * then set its name, role, avatar and connections. The model is not asked for: the bot
 * runs on whichever account is signed in, and its chat asks to sign in when
 * none is. Nothing is created until
 * "Create bot", so closing the page leaves no half-made bot behind.
 */
export function BotNewPage({ creating, onClose, onCreate }: BotNewPageProps) {
  const botCount = useBotUiStore((s) => s.bots.length);
  const { servers, reload } = useKekeServers();
  const auth = useKekeMcpAuth();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [step, setStep] = useState<'pick' | 'setup'>('pick');
  const [template, setTemplate] = useState<BotTemplate | null>(null);
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [avatar, setAvatar] = useState('');
  const [color, setColor] = useState('');
  const [routine, setRoutine] = useState(true);

  const start = (picked: BotTemplate | null) => {
    const look = picked ?? defaultLook(botCount);
    setTemplate(picked);
    setName(picked?.name ?? `Bot ${botCount + 1}`);
    setTitle(picked?.title ?? '');
    setAvatar(look.avatar);
    setColor(look.color);
    setRoutine(true);
    setStep('setup');
  };

  // Add and authorize the matching connector right here, without leaving the page.
  const connect = async (need: TemplateNeed) => {
    const preset = appPresets.find((p) => need.match.some((m) => p.name.includes(m)));
    if (!preset) {
      toast.error(`${need.label} has no one-click connector yet.`);
      return;
    }
    setConnecting(need.label);
    try {
      if (!(servers ?? []).includes(preset.name)) {
        await addKekeMcpServer(preset.name, preset.config);
        reload();
      }
      if (preset.authorizationRequired) await auth.authorize(preset.name, preset.config);
    } catch (error) {
      toast.error(`Could not connect ${need.label}: ${error}`);
    } finally {
      setConnecting(null);
    }
  };

  const create = () => {
    onCreate({
      template,
      name,
      title,
      avatar,
      color,
      description,
      cwd: '',
      servers: template ? templateServers(template, servers ?? []) : [],
      routine,
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <KekeGitHubAuthDialog auth={auth} />
      <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
        <div className="flex items-center gap-2">
          {step === 'setup' && (
            <Button variant="ghost" size="icon" aria-label="Back" onClick={() => setStep('pick')}>
              <ArrowLeft className="size-4" />
            </Button>
          )}
          <h1 className="flex-1 text-lg font-semibold">New bot</h1>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {step === 'pick' ? (
          <>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (description.trim()) start(null);
              }}
            >
              <Label htmlFor="bot-job">What should this bot take care of?</Label>
              <Textarea
                id="bot-job"
                rows={3}
                value={description}
                placeholder="Every weekday at 8, tell me what changed in the Rust ecosystem."
                onChange={(e) => setDescription(e.target.value)}
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={!description.trim()}>
                  Continue
                </Button>
              </div>
            </form>

            {TEMPLATE_GROUPS.map((group) => (
              <section key={group} aria-label={group} className="space-y-2">
                <h2 className="text-xs font-medium text-muted-foreground">{group}</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {BOT_TEMPLATES.filter((t) => t.group === group).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      aria-label={`Use ${t.name}`}
                      className="flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted"
                      onClick={() => start(t)}
                    >
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-full text-base"
                        style={{ backgroundColor: t.color }}
                        aria-hidden="true"
                      >
                        {t.avatar}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{t.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {t.title}
                        </span>
                      </span>
                      <span className="flex shrink-0 gap-1">
                        {t.needs.map((need) => (
                          <span key={need.label} title={need.label}>
                            <NeedIcon
                              need={need}
                              connected={needConnected(need, servers, auth.statuses)}
                            />
                          </span>
                        ))}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </>
        ) : (
          <div className="space-y-5">
            <BotIdentityFields
              name={name}
              onNameChange={setName}
              title={title}
              onTitleChange={setTitle}
              avatar={avatar}
              onAvatarChange={setAvatar}
              color={color}
              onColorChange={setColor}
            />

            {template ? (
              <p className="text-sm text-muted-foreground">
                Stops at: {template.stopsAt.toLowerCase()}.
              </p>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="bot-job">Takes care of</Label>
                <Textarea
                  id="bot-job"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            )}

            {template && template.needs.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-medium">Connections</h2>
                <ul className="divide-y rounded-lg border">
                  {template.needs.map((need) => {
                    const connected = needConnected(need, servers, auth.statuses);
                    const failure = matchingServers(need, Object.keys(auth.errors))
                      .map((name) => auth.errors[name])
                      .find(Boolean);
                    return (
                      <li
                        key={need.label}
                        className="flex flex-wrap items-center gap-x-3 px-3 py-2 text-sm"
                      >
                        <NeedIcon need={need} connected={connected} />
                        <span className="flex-1">
                          {need.label}
                          {need.optional && (
                            <span className="text-muted-foreground"> (optional)</span>
                          )}
                        </span>
                        {connected ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                            <Check className="size-3.5" /> Connected
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={connecting !== null}
                            onClick={() => connect(need)}
                          >
                            {connecting === need.label ? 'Connecting…' : 'Connect'}
                          </Button>
                        )}
                        {failure && !connected && (
                          <p role="alert" className="w-full break-words text-xs text-destructive">
                            {failure}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {template?.routine && (
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox
                  checked={routine}
                  onCheckedChange={(checked) => setRoutine(checked === true)}
                />
                <CalendarClock className="size-4 text-muted-foreground" />
                {template.routine.name} · {scheduleLabel(template.routine.schedule)}
              </Label>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={creating || (!template && !description.trim())} onClick={create}>
                {creating ? 'Creating…' : 'Create bot'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
