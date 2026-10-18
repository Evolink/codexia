import { Download, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fileSrc } from '@/hooks/runtime';
import type { AcpAgentDef } from '@/services/apiAdapt/acp';

/** Thumbnails of the images attached to the next prompt. */
export function AcpImageStrip({
  images,
  onRemove,
}: {
  images: string[];
  onRemove: (path: string) => void;
}) {
  if (images.length === 0) return null;
  return (
    <div className="flex gap-2 p-3 pb-0 overflow-x-auto">
      {images.map((path) => (
        <div key={path} className="relative group shrink-0">
          <img
            src={path.startsWith('data:') ? path : fileSrc(path)}
            alt="attachment"
            className="h-16 w-16 object-cover rounded-md border"
          />
          <button
            type="button"
            aria-label="Remove image"
            onClick={() => onRemove(path)}
            className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Uninstalled agents run through an npx download — never do that implicitly. */
export function AcpInstallBanner({
  agent,
  connecting,
  onInstall,
}: {
  agent: AcpAgentDef;
  connecting: boolean;
  onInstall: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t bg-muted/30 text-xs">
      <span className="min-w-0 flex-1 text-muted-foreground">
        {agent.name} is not installed — starting it downloads{' '}
        <span className="font-mono">{[agent.command, ...agent.args].join(' ')}</span>
      </span>
      <Button size="sm" className="h-6 gap-1" disabled={connecting} onClick={onInstall}>
        <Download className="h-3 w-3" />
        Download &amp; run
      </Button>
    </div>
  );
}

/** Why the agent is not ready yet, next to the session controls. */
export function AcpConnectStatus({
  agentName,
  needsProject,
  connecting,
}: {
  agentName: string | undefined;
  needsProject: boolean;
  connecting: boolean;
}) {
  if (needsProject) {
    return (
      <span className="px-1 text-[10px] text-muted-foreground">
        Choose a project above to start {agentName ?? 'the agent'}
      </span>
    );
  }
  if (!connecting) return null;
  return (
    <span className="flex items-center gap-1 px-1 text-[10px] text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      Starting {agentName ?? 'agent'}...
    </span>
  );
}
