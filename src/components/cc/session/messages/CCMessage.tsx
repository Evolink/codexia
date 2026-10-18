import { Card } from '@/components/ui/card';
import { useCCStore } from '@/stores/cc';
import { useCCSettingsStore } from '@/stores/settings/useCCSettingsStore';
import type { CCMessage as CCMessageType } from '../../types/messages';
import type { PermissionDecision } from '../../types/permission';
import { PermissionRequestCard } from './PermissionRequestCard';
import { RateLimitCard } from './RateLimitCard';
import { SystemInitCard } from './SystemInitCard';
import { safeStringify } from './utils';

interface CCMessageProps {
  message: CCMessageType;
  index: number;
}

export function CCMessage({ message: msg, index: idx }: CCMessageProps) {
  const { showPermissionCards } = useCCSettingsStore();
  const { updateMessage } = useCCStore();

  const handleResolvePermission = async (requestId: string, decision: PermissionDecision) => {
    const { ccResolvePermission } = await import('@/services');
    try {
      await ccResolvePermission(requestId, decision);
      updateMessage(idx, { resolved: decision } as any);
    } catch (err) {
      console.error('Failed to resolve permission:', err);
    }
  };

  // Assistant and user messages render through CCTranscript.
  switch (msg.type) {
    case 'permission_request':
      if (!showPermissionCards) return null;
      return <PermissionRequestCard msg={msg} onResolve={handleResolvePermission} />;

    case 'system':
      return msg.subtype === 'init' ? <SystemInitCard msg={msg} /> : null;

    case 'rate_limit_event':
      return <RateLimitCard msg={msg} />;

    case 'stream_event':
      return null;

    default:
      return (
        <Card className="p-3">
          <pre className="text-xs overflow-auto max-h-64">
            <code>{safeStringify(msg)}</code>
          </pre>
        </Card>
      );
  }
}
