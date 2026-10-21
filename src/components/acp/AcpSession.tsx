import { cn } from 'cn';
import { useMemo } from 'react';
import { Streamdown } from 'streamdown';
import { MessageToolbar, THREAD_COLUMN, ThreadScroller, UserMessage } from '@/components/common';
import { Button } from '@/components/ui/button';
import { acpAuthenticate, acpNewSession, acpRespondPermission } from '@/services/apiAdapt/acp';
import { useWorkspaceStore } from '@/stores';
import { useAcpStore } from '@/stores/useAcpStore';
import { AcpPermissionCard } from './AcpPermissionCard';
import { AcpTranscript } from './AcpTranscript';
import { acpUserTurns, buildAcpTranscript } from './transcript';

export default function AcpSession() {
  const {
    connectionId,
    sessionId,
    authMethods,
    entries,
    running,
    permission,
    setPermission,
    applySession,
    addEntry,
  } = useAcpStore();
  const cwd = useWorkspaceStore((s) => s.cwd);
  const items = useMemo(() => buildAcpTranscript(entries, running), [entries, running]);
  const turns = useMemo(() => acpUserTurns(items), [items]);

  const authenticate = async (methodId: string) => {
    if (!connectionId || !cwd) return;
    try {
      await acpAuthenticate(connectionId, methodId);
      applySession(await acpNewSession(connectionId, cwd));
    } catch (e) {
      addEntry({ id: `auth-${Date.now()}`, role: 'error', text: String(e) });
    }
  };

  const respond = async (optionId: string | null) => {
    if (!connectionId || !permission) return;
    setPermission(null);
    await acpRespondPermission(connectionId, permission.requestId, optionId);
  };

  if (!connectionId) return null;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <ThreadScroller turns={turns} className="flex-1" contentClassName="text-sm">
        {!sessionId && authMethods.length > 0 && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="text-xs text-muted-foreground">
              This agent needs authentication before a session can start.
            </div>
            <div className="flex flex-wrap gap-2">
              {authMethods.map((m) => (
                <Button key={m.id} size="sm" variant="outline" onClick={() => authenticate(m.id)}>
                  {m.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        <AcpTranscript
          items={items}
          renderEntry={(entry) => {
            if (entry.role === 'user') return <UserMessage text={entry.text} />;
            if (entry.role === 'agent') {
              return (
                <div className="group flex min-w-0 flex-col items-start gap-1">
                  <div className="min-w-0 max-w-full text-sm">
                    <Streamdown>{entry.text}</Streamdown>
                  </div>
                  <MessageToolbar text={entry.text} />
                </div>
              );
            }
            return (
              <div className="whitespace-pre-wrap rounded-md px-2 py-1 text-destructive">
                {entry.text}
              </div>
            );
          }}
        />
      </ThreadScroller>

      {permission && (
        <div className={cn(THREAD_COLUMN, 'shrink-0 pb-3')}>
          <AcpPermissionCard permission={permission} onRespond={respond} />
        </div>
      )}
    </div>
  );
}
