import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { isDesktopTauri } from '@/hooks/runtime';
import { openEventStream } from '@/lib/eventStream';
import { useCCStore } from '@/stores/cc';
import { useAgentCenterStore } from '@/stores/useAgentCenterStore';
import type { CCMessage, SystemMessage } from '../types/messages';

const CC_LISTENER_READY_EVENT = 'cc-session-listener-ready';
const CC_PERMISSION_LISTENER_READY_EVENT = 'cc-permission-listener-ready';

interface CCListenerOptions {
  /** Disable the listener entirely. */
  disabled?: boolean;
  /**
   * When provided, operates in embedded mode: only messages matching this
   * sessionId are accepted and routed via addMessageToSession instead of
   * the global addMessage.
   */
  sessionId?: string;
}

/**
 * Signals `useCCSessionManager` that this session's listener is bound.
 * Only standalone listeners signal; embedded ones are not what it waits for.
 */
function dispatchReady(eventName: string, sessionId: string, embedded: boolean) {
  if (embedded) return;
  window.dispatchEvent(new CustomEvent(eventName, { detail: { sessionId } }));
}

/**
 * Subscribes to backend events, over Tauri IPC on desktop and SSE elsewhere,
 * and signals readiness once the subscription is live. On the web all events
 * share one stream: each stream holds an HTTP connection, and the browser
 * queues every request beyond its per-host limit.
 * Returns the effect cleanup that tears the subscription down.
 */
function subscribe(
  handlers: Record<string, (payload: unknown) => void>,
  readyEvent: string,
  sessionId: string,
  embedded: boolean
): () => void {
  const events = Object.keys(handlers);
  if (isDesktopTauri()) {
    const unlistenPromises = events.map((event) =>
      listen(event, (e) => handlers[event](e.payload))
    );
    void Promise.all(unlistenPromises).then(() => dispatchReady(readyEvent, sessionId, embedded));
    return () => {
      for (const unlistenPromise of unlistenPromises) void unlistenPromise.then((fn) => fn());
    };
  }

  const closeStream = openEventStream({
    label: `[CCSession/${events.join(',')}]`,
    onEvent: (envelope) => handlers[envelope.event]?.(envelope.payload),
  });
  dispatchReady(readyEvent, sessionId, embedded);
  return closeStream;
}

type RenamePayload = { sessionId: string; newSessionId: string };

/**
 * Hook to listen for message stream events from the Tauri backend.
 * Supports both standalone (global active session) and embedded (per-session) modes.
 * Also follows the session to the id the CLI continues under after `/clear`; the
 * backend emits that after the turn's result, so no message is lost while ids switch.
 */
export function useCCSessionListener({ disabled = false, sessionId }: CCListenerOptions = {}) {
  const activeSessionId = useCCStore((s) => s.activeSessionId);
  const addMessage = useCCStore((s) => s.addMessage);
  const addMessageToSession = useCCStore((s) => s.addMessageToSession);
  const setSlashCommands = useCCStore((s) => s.setSlashCommands);

  // In embedded mode the target session is the explicit sessionId; otherwise the active one.
  const targetSessionId = sessionId ?? activeSessionId;

  useEffect(() => {
    if (disabled || !targetSessionId) return;

    const handleMessage = (message: CCMessage) => {
      const msgSessionId = (message as { session_id?: string }).session_id;
      if (msgSessionId && msgSessionId !== targetSessionId) return;

      if (sessionId) {
        addMessageToSession(sessionId, message);
        return;
      }

      if (message.type === 'system' && (message as SystemMessage).subtype === 'init') {
        const cmds = (message as SystemMessage).slash_commands;
        if (Array.isArray(cmds)) setSlashCommands(cmds);
      }
      addMessage(message);
    };

    const handleRename = ({ sessionId: from, newSessionId: to }: RenamePayload) => {
      if (from !== targetSessionId) return;
      useCCStore.getState().renameSession(from, to);
      useAgentCenterStore.getState().renameCard('cc', from, to);
    };

    return subscribe(
      {
        'cc-message': (payload) => handleMessage(payload as CCMessage),
        'cc-session-renamed': (payload) => handleRename(payload as RenamePayload),
      },
      CC_LISTENER_READY_EVENT,
      targetSessionId,
      Boolean(sessionId)
    );
  }, [disabled, targetSessionId, sessionId, addMessage, addMessageToSession, setSlashCommands]);
}

type PermPayload = {
  requestId: string;
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  alwaysAllowTarget?: 'project' | 'session';
};

/**
 * Hook to listen for permission requests from the Tauri backend.
 * Supports both standalone (global active session) and embedded (per-session) modes.
 */
export function useCCPermissionListener({ disabled = false, sessionId }: CCListenerOptions = {}) {
  const activeSessionId = useCCStore((s) => s.activeSessionId);
  const addMessage = useCCStore((s) => s.addMessage);
  const addMessageToSession = useCCStore((s) => s.addMessageToSession);

  const targetSessionId = sessionId ?? activeSessionId;

  useEffect(() => {
    if (disabled || !targetSessionId) return;

    const handlePermission = (payload: PermPayload) => {
      const {
        requestId,
        sessionId: evtSessionId,
        toolName,
        toolInput,
        alwaysAllowTarget,
      } = payload;
      if (evtSessionId !== targetSessionId) {
        if (!sessionId) {
          console.warn('[CCSession] Ignoring permission request for inactive session', {
            targetSessionId,
            requestId,
            evtSessionId,
          });
        }
        return;
      }

      const permissionMessage = {
        type: 'permission_request',
        requestId,
        sessionId: evtSessionId,
        toolName,
        alwaysAllowTarget,
        toolInput,
      } as CCMessage;

      if (sessionId) {
        addMessageToSession(sessionId, permissionMessage);
      } else {
        addMessage(permissionMessage);
      }
    };

    return subscribe(
      { 'cc-permission-request': (payload) => handlePermission(payload as PermPayload) },
      CC_PERMISSION_LISTENER_READY_EVENT,
      targetSessionId,
      Boolean(sessionId)
    );
  }, [disabled, targetSessionId, sessionId, addMessage, addMessageToSession]);
}
