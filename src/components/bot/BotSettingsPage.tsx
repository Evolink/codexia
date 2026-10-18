import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { type Bot, deleteBot } from '@/services/apiAdapt/bots';
import { useBotUiStore } from '@/stores/useBotUiStore';
import { BotCollaborationFields } from './BotCollaborationFields';
import { BotIdentityFields } from './BotIdentityFields';
import { BotModelPicker } from './BotModelPicker';
import { BotTrustFields } from './BotTrustFields';
import { saveBotSettings } from './saveBotSettings';
import { useBotSettingsForm } from './useBotSettingsForm';

interface BotSettingsPageProps {
  bot: Bot;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

/** A bot's settings, in the Bot tab in place of its conversation. */
export function BotSettingsPage({ bot, onClose }: BotSettingsPageProps) {
  const removeBot = useBotUiStore((s) => s.removeBot);
  const form = useBotSettingsForm(bot, true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const running = useBotUiStore((state) => Boolean(state.runningByBot[bot.id]));

  const save = async () => {
    if (saving || useBotUiStore.getState().runningByBot[bot.id]) return;
    setSaving(true);
    try {
      await saveBotSettings(bot, form.patch);
      onClose();
    } catch (e) {
      toast({ title: 'Could not save', description: String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await deleteBot(bot.id);
      removeBot(bot.id);
    } catch (e) {
      toast({ title: 'Could not delete', description: String(e), variant: 'destructive' });
    } finally {
      setConfirmDelete(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-6">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Back to chat" onClick={onClose}>
              <ArrowLeft className="size-4" />
            </Button>
            <h1 className="flex-1 truncate text-lg font-semibold">Settings</h1>
          </div>

          <Section title="Profile">
            <BotIdentityFields
              name={form.name}
              onNameChange={form.setName}
              title={form.title}
              onTitleChange={form.setTitle}
              avatar={form.avatar}
              onAvatarChange={form.setAvatar}
              color={form.color}
              onColorChange={form.setColor}
            />
          </Section>

          <Section title="Instructions">
            <Label htmlFor="bot-prompt" className="sr-only">
              Instructions
            </Label>
            <Textarea
              id="bot-prompt"
              rows={5}
              value={form.systemPrompt}
              placeholder="What this bot takes care of, and how it should work."
              onChange={(e) => form.setSystemPrompt(e.target.value)}
            />
          </Section>

          <Section title="Permissions">
            <BotTrustFields
              trustLevel={form.trustLevel}
              onTrustLevelChange={form.setTrustLevel}
              approvedTools={form.approvedTools}
              onApprovedToolsChange={form.setApprovedTools}
            />
          </Section>

          <Collapsible>
            <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-medium">
              <ChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" />
              Advanced
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-6 pt-4">
              <div className="space-y-2">
                <Label>Model</Label>
                <BotModelPicker
                  provider={form.provider}
                  model={form.model}
                  reasoningEffort={form.reasoningEffort}
                  onChange={(next) => {
                    form.setProvider(next.provider);
                    form.setModel(next.model);
                    form.setReasoningEffort(next.reasoningEffort);
                  }}
                />
              </div>
              <BotCollaborationFields
                botId={bot.id}
                allowedBotIds={form.allowedBotIds}
                onAllowedBotIdsChange={form.setAllowedBotIds}
              />
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                Delete bot
              </Button>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      <div className="shrink-0 border-t bg-background px-4 py-3">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-end gap-2">
          {running && (
            <p className="mr-auto text-xs text-muted-foreground">
              Stop the current task to save settings.
            </p>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving || running} onClick={save}>
            Save
          </Button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDelete}
        title={`Delete ${bot.name}?`}
        description="Its conversations, results and drafts are deleted. This cannot be undone."
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
