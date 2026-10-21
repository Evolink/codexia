import { Card } from '@/components/ui/card';
import { useCCSettingsStore } from '@/stores/settings/useCCSettingsStore';
import type { CCMessage as CCMessageType } from '../../types/messages';
import { ResolvedPermissionRow } from './PermissionRequestCard';
import { RateLimitCard } from './RateLimitCard';
import { safeStringify } from './utils';

interface CCMessageProps {
  message: CCMessageType;
  index: number;
}

export function CCMessage({ message: msg }: CCMessageProps) {
  const { showPermissionCards } = useCCSettingsStore();

  // Assistant and user messages render through CCTranscript.
  switch (msg.type) {
    case 'permission_request':
      // Pending requests are pinned above the composer by CCSession.
      if (!showPermissionCards) return null;
      return <ResolvedPermissionRow msg={msg} />;

    case 'system':
      return null;

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
