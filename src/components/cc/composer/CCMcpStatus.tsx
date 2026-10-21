import { PlugZap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { usePluginsNavigationStore } from '@/stores/usePluginsNavigationStore';
import { useCCMcpProblems } from '../hooks/useCCMcpProblems';

const STATUS_LABEL: Record<string, string> = {
  failed: 'Failed',
  'needs-auth': 'Needs sign-in',
};

/** Composer chip for MCP servers and plugins that are not working in this session. */
export function CCMcpStatus({ sessionId }: { sessionId: string | null }) {
  const { servers, plugins } = useCCMcpProblems(sessionId);
  const count = servers.length + plugins.length;
  if (count === 0) return null;

  const label = `${count} ${count === 1 ? 'tool' : 'tools'} not working`;
  const needsAuth = servers.some((s) => s.status === 'needs-auth');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-1.5 text-[10px] text-amber-600 dark:text-amber-400"
          aria-label={label}
          title={label}
        >
          <PlugZap className="h-3.5 w-3.5" />
          {count}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 max-w-[calc(100vw-2rem)] p-3">
        <div className="flex flex-col gap-2 text-xs">
          <ul className="flex flex-col gap-1.5">
            {servers.map((server) => (
              <li key={`mcp:${server.name}`} className="min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{server.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {STATUS_LABEL[server.status] ?? server.status}
                  </span>
                </div>
                {server.error && (
                  <p className="break-words text-muted-foreground">{server.error}</p>
                )}
              </li>
            ))}
            {plugins.map((plugin) => (
              <li key={`plugin:${plugin.plugin}`} className="min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{plugin.plugin}</span>
                  <span className="shrink-0 text-muted-foreground">Plugin failed</span>
                </div>
                <p className="break-words text-muted-foreground">{plugin.message}</p>
              </li>
            ))}
          </ul>
          {needsAuth && (
            <p className="text-muted-foreground">
              Sign in with <code>/mcp</code> in Claude Code.
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 self-start text-xs"
            onClick={() => {
              const nav = usePluginsNavigationStore.getState();
              nav.setMainTab('Connectors');
              nav.setConnectorTarget('agent');
              useLayoutStore.getState().setView('plugins');
            }}
          >
            Manage connectors
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
