import { useEffect, useMemo } from 'react';
import { CCMessage } from '@/components/cc/session/messages';
import { PermissionRequestCard } from '@/components/cc/session/messages/PermissionRequestCard';
import { THREAD_COLUMN, ThreadScroller } from '@/components/common';
import { useCCSessionManager } from '@/hooks/useCCSessionManager';
import { ccGetSessionMessages, ccResumeSession } from '@/services/apiAdapt/cc';
import { useCCStore } from '@/stores/cc';
import { useCCSettingsStore } from '@/stores/settings';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useCCPermissionListener, useCCSessionListener } from '../hooks';
import type { PermissionRequestMessage } from '../types/messages';
import type { PermissionDecision } from '../types/permission';
import { fromSdkMessages } from '../utils/fromSdkMessages';
import { buildCCTranscript, ccUserTurns } from './transcript/buildCCTranscript';
import { CCTranscript } from './transcript/CCTranscript';

interface CCSessionProps {
  /** When provided, renders in embedded (grid-card) mode for this specific session. */
  sessionId?: string;
  /**
   * Disable the internal event listeners. Use when a sibling standalone CCSession
   * is already listening to the same session to prevent double-writing messages.
   */
  disableListener?: boolean;
}

export default function CCSession({ sessionId, disableListener = false }: CCSessionProps = {}) {
  const isEmbedded = !!sessionId;

  const {
    activeSessionId,
    activeSessionIds,
    addActiveSessionId,
    messages: globalMessages,
    sessionMessagesMap,
    sessionLoadingMap,
    isLoading: globalIsLoading,
    setLoading,
    setConnected,
    clearMessages,
    options,
    updateMessage,
    updateSessionMessage,
    addMessageToSession,
    setSessionLoading,
  } = useCCStore();
  const { cwd } = useWorkspaceStore();
  const { handleEditPrompt } = useCCSessionManager();

  // In embedded mode use per-session data; otherwise use the global active-session data.
  const messages = sessionId ? (sessionMessagesMap[sessionId] ?? []) : globalMessages;
  const enabledThinking = useCCSettingsStore((state) => state.enabledThinking);
  const isLoading = sessionId ? (sessionLoadingMap[sessionId] ?? false) : globalIsLoading;

  const items = useMemo(
    () => buildCCTranscript(messages, isLoading, { showThinking: enabledThinking }),
    [messages, isLoading, enabledThinking]
  );
  const turns = useMemo(() => ccUserTurns(items), [items]);

  // Reset transient UI state when directory changes (standalone mode only).
  useEffect(() => {
    if (isEmbedded || !cwd || activeSessionId) return;
    clearMessages();
    setConnected(false);
    setLoading(false);
  }, [cwd, activeSessionId, clearMessages, setConnected, setLoading, isEmbedded]);

  // Load JSONL history for the active session (always, independent of resume).
  // Review-first: spawning the agent is gated behind an explicit Resume button
  // (rendered below) so peeking at history doesn't pay the agent-spawn cost.
  // biome-ignore lint/correctness/useExhaustiveDependencies: this effect runs once per activeSessionId to load history and resume; it must not re-run on other value changes
  useEffect(() => {
    if (isEmbedded) return;
    if (!activeSessionId || activeSessionIds.includes(activeSessionId)) return;
    const sid = activeSessionId;
    const sessionCwd = cwd;
    if (!sessionCwd?.trim()) return;
    void (async () => {
      try {
        const sdkMessages = await ccGetSessionMessages(sid);
        for (const msg of fromSdkMessages(sdkMessages, sid)) {
          addMessageToSession(sid, msg);
        }
        setSessionLoading(sid, false);
        await ccResumeSession(sid, {
          cwd: sessionCwd,
          permissionMode: options.permissionMode,
          resume: sid,
          continueConversation: true,
          ...(options.model ? { model: options.model } : {}),
          ...(options.effort ? { effort: options.effort } : {}),
        });
        addActiveSessionId(sid);
      } catch (err) {
        console.error('[CCSession] Failed to load/resume session', { sessionId: sid, err });
        setSessionLoading(sid, false);
      }
    })();
  }, [activeSessionId, isEmbedded]);

  const pendingPermissionIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.type === 'permission_request' && !m.resolved) return i;
    }
    return -1;
  }, [messages]);

  const handleResolvePermission = async (requestId: string, decision: PermissionDecision) => {
    const { ccResolvePermission } = await import('@/services');
    try {
      await ccResolvePermission(requestId, decision);
      const patch: Partial<PermissionRequestMessage> = { resolved: decision };
      if (isEmbedded && sessionId) {
        updateSessionMessage(sessionId, pendingPermissionIdx, patch);
      } else {
        updateMessage(pendingPermissionIdx, patch);
      }
    } catch (err) {
      console.error('Failed to resolve permission:', err);
    }
  };

  useCCSessionListener({ sessionId, disabled: disableListener });
  useCCPermissionListener({ sessionId, disabled: disableListener });

  return (
    <div className="flex flex-col h-full min-h-0 w-full">
      <ThreadScroller
        turns={turns}
        jumpButton={!isEmbedded}
        className="flex-1"
        contentClassName="thread-surface"
      >
        <CCTranscript
          items={items}
          renderMessage={(index) => <CCMessage message={messages[index]} index={index} />}
          onEditPrompt={
            // Branching moves the main view's session; cards and busy sessions stay put.
            !isEmbedded && !isLoading && activeSessionId
              ? (prompt) => handleEditPrompt(activeSessionId, prompt)
              : undefined
          }
        />
        {isLoading && <div className="text-xs text-muted-foreground animate-pulse">Thinking</div>}
      </ThreadScroller>

      {pendingPermissionIdx !== -1 && (
        <div className={THREAD_COLUMN}>
          <PermissionRequestCard
            msg={messages[pendingPermissionIdx] as PermissionRequestMessage}
            onResolve={handleResolvePermission}
          />
        </div>
      )}
    </div>
  );
}
