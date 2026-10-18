import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { AgentLogo } from './AgentLogo';
import { useAgentChoice } from './useAgentChoice';

/** Codex and Claude stay fixed; every ACP agent lives in one dropdown. */
export function AgentPicker({ className }: { className?: string }) {
  const { options, current, isCurrent, select } = useAgentChoice();
  const builtin = options.filter((o) => o.kind === 'builtin');
  const acp = options.filter((o) => o.kind === 'acp');
  const acpCurrent = current?.kind === 'acp' ? current : undefined;
  const shown = acpCurrent ?? acp[0];

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      {current && <AgentLogo id={current.id} className="h-16 w-16" />}
      <div role="radiogroup" aria-label="Agent" className="flex flex-wrap justify-center gap-2">
        {builtin.map((option) => (
          <Button
            key={option.id}
            role="radio"
            aria-checked={isCurrent(option)}
            variant="outline"
            size="sm"
            className={cn(
              'h-9 gap-2 rounded-full px-3',
              isCurrent(option) && 'border-primary bg-accent text-accent-foreground'
            )}
            onClick={() => select(option)}
          >
            <AgentLogo id={option.id} />
            <span>{option.name}</span>
          </Button>
        ))}
        {shown && (
          <>
            <Separator
              orientation="vertical"
              className="mx-1 self-center data-[orientation=vertical]:h-6"
            />
            <fieldset aria-label="ACP agent" className="m-0 flex min-w-0 border-0 p-0">
              <Button
                variant="outline"
                size="sm"
                title={shown.available ? shown.name : `${shown.name} (not installed)`}
                className={cn(
                  'h-9 gap-2 rounded-l-full rounded-r-none px-3',
                  acpCurrent && 'border-primary bg-accent text-accent-foreground'
                )}
                onClick={() => select(shown)}
              >
                <AgentLogo id={shown.id} />
                <span>{shown.name}</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Switch ACP agent"
                    className={cn(
                      '-ml-px h-9 rounded-l-none rounded-r-full px-2',
                      acpCurrent && 'border-primary bg-accent text-accent-foreground'
                    )}
                  >
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center">
                  {acp.map((option) => (
                    <DropdownMenuItem
                      key={option.id}
                      className={cn('gap-2', !option.available && 'opacity-50')}
                      onSelect={() => select(option)}
                    >
                      <AgentLogo id={option.id} />
                      <span>
                        {option.available ? option.name : `${option.name} (not installed)`}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </fieldset>
          </>
        )}
      </div>
    </div>
  );
}
