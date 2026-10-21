import { useEffect, useState } from 'react';
import { ccMcpStatus } from '@/services';
import type { CcMcpServerStatus } from '@/services/apiAdapt/cc';
import { useCCStore } from '@/stores/cc';
import type { SystemMessage } from '../types/messages';

export type CCPluginError = NonNullable<SystemMessage['plugin_errors']>[number];

export interface CCMcpProblems {
  servers: CcMcpServerStatus[];
  plugins: CCPluginError[];
}

const NO_PLUGIN_ERRORS: CCPluginError[] = [];

/**
 * Failed servers, and servers the user added that need sign-in. claude.ai
 * connectors the account never signed in to are always listed as needing
 * sign-in; they are not a problem with this session.
 */
function isProblem(server: CcMcpServerStatus) {
  if (server.status === 'failed') return true;
  return server.status === 'needs-auth' && server.scope !== 'claudeai';
}

/**
 * MCP servers that failed or need sign-in, and plugins that failed to load, for
 * a session. Server status is read live after each turn: the init message only
 * has a snapshot taken while servers may still be connecting.
 */
export function useCCMcpProblems(sessionId: string | null): CCMcpProblems {
  const loading = useCCStore((s) => (sessionId ? s.sessionLoadingMap[sessionId] : undefined));
  const plugins = useCCStore((s) => {
    const messages = sessionId ? (s.sessionMessagesMap[sessionId] ?? s.messages) : s.messages;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.type === 'system' && msg.subtype === 'init') {
        return msg.plugin_errors ?? NO_PLUGIN_ERRORS;
      }
    }
    return NO_PLUGIN_ERRORS;
  });
  const [status, setStatus] = useState<{ sessionId: string; servers: CcMcpServerStatus[] } | null>(
    null
  );

  useEffect(() => {
    // Read once each turn finishes; a session that never ran has no live client.
    if (!sessionId || loading !== false) return;
    let cancelled = false;
    ccMcpStatus(sessionId)
      .then(({ mcpServers }) => {
        if (cancelled) return;
        const servers = mcpServers.filter(isProblem);
        setStatus({ sessionId, servers });
      })
      .catch((err) => console.debug('[useCCMcpProblems] MCP status unavailable', err));
    return () => {
      cancelled = true;
    };
  }, [sessionId, loading]);

  const servers = status && status.sessionId === sessionId ? status.servers : [];
  return { servers, plugins };
}
