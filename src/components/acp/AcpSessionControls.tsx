import { ChevronDown, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/use-toast';
import {
  type AcpConfigOption,
  acpPrompt,
  acpSetConfigOption,
  acpSetMode,
} from '@/services/apiAdapt/acp';
import { useAcpStore } from '@/stores/useAcpStore';

type ModeChoice = { value: string; name: string; description?: string };

/** One mode-like setting the agent exposes: a choice list, or an on/off switch. */
type ModeSection =
  | {
      id: string;
      name: string;
      type: 'select';
      value: string;
      options: ModeChoice[];
      onChange: (value: string) => void;
    }
  | {
      id: string;
      name: string;
      type: 'boolean';
      value: boolean;
      description?: string;
      onChange: (value: boolean) => void;
    };

/**
 * What the closed menu shows: the first setting moved off its default (e.g.
 * "Plan", "Automatic review"), since that is what changes the agent's
 * behaviour; otherwise the first setting's value.
 */
function triggerLabel(sections: ModeSection[]) {
  for (const section of sections) {
    if (section.type === 'boolean') {
      if (section.value) return section.name;
      continue;
    }
    if (section.options[0] && section.value !== section.options[0].value) {
      return section.options.find((o) => o.value === section.value)?.name ?? section.value;
    }
  }
  const first = sections.find((s) => s.type === 'select');
  if (!first || first.type !== 'select') return sections[0]?.name ?? '';
  return first.options.find((o) => o.value === first.value)?.name ?? first.value;
}

/** Every mode-like setting of the session in one menu, like the Codex access menu. */
function ModeMenu({ sections, disabled }: { sections: ModeSection[]; disabled?: boolean }) {
  if (!sections.length) return null;
  const label = triggerLabel(sections);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-8 max-w-44 gap-1.5 px-2 text-xs text-muted-foreground"
          aria-label={`Session mode: ${label}`}
        >
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        {sections.map((section, i) => (
          <div key={section.id}>
            {i > 0 && <DropdownMenuSeparator />}
            {section.type === 'boolean' ? (
              <DropdownMenuCheckboxItem
                checked={section.value}
                onCheckedChange={(checked) => section.onChange(checked === true)}
                title={section.description}
                className="text-xs"
              >
                {section.name}
              </DropdownMenuCheckboxItem>
            ) : (
              <>
                <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                  {section.name}
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup value={section.value} onValueChange={section.onChange}>
                  {section.options.map((o) => (
                    <DropdownMenuRadioItem
                      key={o.value}
                      value={o.value}
                      title={o.description}
                      className="text-xs"
                    >
                      {o.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </>
            )}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Approval mode for Grok, which implements neither `session/set_mode` nor
 * `modes` on `session/new` — its only session-scoped switch is the
 * `always-approve` slash command, sent as prompt text. There is no way to read
 * the current value back, so the selection is tracked locally — keyed on the
 * session so a new one starts back on ask.
 */
function GrokApprovalMenu({
  connectionId,
  sessionId,
}: {
  connectionId: string;
  sessionId: string;
}) {
  const running = useAcpStore((s) => s.running);
  const [value, setValue] = useState('ask');

  return (
    <ModeMenu
      disabled={running}
      sections={[
        {
          id: 'approval',
          name: 'Approval',
          type: 'select',
          value,
          options: [
            { value: 'ask', name: 'Ask', description: 'Prompt before each tool call' },
            { value: 'yolo', name: 'Always approve', description: 'Skip all permission prompts' },
          ],
          onChange: async (next) => {
            const previous = value;
            setValue(next);
            try {
              await acpPrompt(
                connectionId,
                sessionId,
                `/always-approve ${next === 'yolo' ? 'on' : 'off'}`
              );
            } catch (e) {
              setValue(previous);
              toast({
                title: 'Agent rejected the change',
                description: String(e),
                variant: 'destructive',
              });
            }
          },
        },
      ]}
    />
  );
}

/**
 * Mode / approval / sandbox controls for the live session, folded into one
 * menu on the left of the composer toolbar. Model / effort / account live in
 * {@link AcpModelMenu} on the right.
 *
 * Agents expose mode two ways: `configOptions` with category `'mode'` (the
 * generic mechanism, keke and the Codex adapter), or the older `modes` field
 * (Gemini). Grok reports neither, so its approval switch falls back to
 * {@link GrokApprovalMenu}.
 */
export function AcpSessionControls() {
  const {
    agentId,
    connectionId,
    sessionId,
    modes,
    configOptions,
    setCurrentMode,
    setConfigOptionValue,
  } = useAcpStore();

  if (!connectionId || !sessionId) return null;

  // Update optimistically, then roll back if the agent rejects the change
  // (e.g. Gemini refuses privileged modes in an untrusted folder).
  const apply = async (revert: () => void, request: () => Promise<void>) => {
    try {
      await request();
    } catch (e) {
      revert();
      toast({ title: 'Agent rejected the change', description: String(e), variant: 'destructive' });
    }
  };

  const changeConfigOption = (option: AcpConfigOption, value: string | boolean) => {
    const previous = option.currentValue;
    setConfigOptionValue(option.id, value);
    return apply(
      () => setConfigOptionValue(option.id, previous),
      () => acpSetConfigOption(connectionId, sessionId, option.id, value)
    );
  };

  if (configOptions.length) {
    const sections = configOptions
      .filter((o) => o.category === 'mode')
      .map(
        (option): ModeSection =>
          option.type === 'boolean'
            ? {
                id: option.id,
                name: option.name,
                type: 'boolean',
                value: option.currentValue === true,
                description: option.description,
                onChange: (checked) => changeConfigOption(option, checked),
              }
            : {
                id: option.id,
                name: option.name,
                type: 'select',
                value: String(option.currentValue),
                options: option.options ?? [],
                onChange: (value) => changeConfigOption(option, value),
              }
      );
    return <ModeMenu sections={sections} />;
  }

  if (!modes?.availableModes.length) {
    return agentId === 'grok' ? (
      <GrokApprovalMenu key={sessionId} connectionId={connectionId} sessionId={sessionId} />
    ) : null;
  }
  return (
    <ModeMenu
      sections={[
        {
          id: 'mode',
          name: 'Mode',
          type: 'select',
          value: modes.currentModeId,
          options: modes.availableModes.map((m) => ({
            value: m.id,
            name: m.name,
            description: m.description,
          })),
          onChange: (modeId) => {
            const previous = modes.currentModeId;
            setCurrentMode(modeId);
            return apply(
              () => setCurrentMode(previous),
              () => acpSetMode(connectionId, sessionId, modeId)
            );
          },
        },
      ]}
    />
  );
}
