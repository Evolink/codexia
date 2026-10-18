import { useCallback, useEffect, useRef, useState } from 'react';
import {
  authorizeGitHubMcp,
  authorizeGoogleMcp,
  type KekeMcpAuthStatus,
  type KekeMcpServer,
  loginKekeMcpServer,
  readKekeMcpAuthStatuses,
  readKekeMcpServers,
  setKekeMcpOAuthClient,
} from '@/services/apiAdapt/kekeMcp';
import { useBotUiStore } from '@/stores/useBotUiStore';
import { isGitHubMcpServer, isGoogleMcpServer, mcpAuthError } from './mcpAuthentication';

export function useKekeMcpAuth(enabled = true) {
  const [statuses, setStatuses] = useState<Record<string, KekeMcpAuthStatus>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [githubName, setGitHubName] = useState<string | null>(null);
  const [googleName, setGoogleName] = useState<string | null>(null);
  const mounted = useRef(false);
  const busy = useRef(false);
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const request = ++requestId.current;
    try {
      const result = await readKekeMcpAuthStatuses();
      if (mounted.current && request === requestId.current) {
        setStatuses(result);
        setError('');
      }
    } catch (failure) {
      if (mounted.current && request === requestId.current) setError(String(failure));
    }
  }, [enabled]);
  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
      requestId.current += 1;
    };
  }, [refresh]);

  const authorize = async (name: string, config?: KekeMcpServer) => {
    if (busy.current) return false;
    busy.current = true;
    setPending(name);
    setErrors((previous) => ({ ...previous, [name]: '' }));
    try {
      // Neither GitHub nor Google lets keke register itself; without an OAuth
      // client, ask for a token (or, for Google, the user's own client).
      const github = isGitHubMcpServer(config);
      if (github || isGoogleMcpServer(config)) {
        const current = (await readKekeMcpServers())[name];
        const metadata = current?._meta as Record<string, unknown> | undefined;
        if (!current?.oauth && !metadata?.['keke.dev/oauth']) {
          if (mounted.current) (github ? setGitHubName : setGoogleName)(name);
          return false;
        }
      }
      await loginKekeMcpServer(name);
      useBotUiStore.getState().markMcpChanged(name);
      if (mounted.current) markSignedIn(name);
      await refresh();
      return true;
    } catch (failure) {
      if (mounted.current)
        setErrors((previous) => ({ ...previous, [name]: mcpAuthError(failure) }));
      return false;
    } finally {
      busy.current = false;
      if (mounted.current) setPending(null);
    }
  };
  const markSignedIn = (name: string) =>
    setStatuses((previous) => ({
      ...previous,
      [name]: { signedIn: true, needsMoreAccess: false, error: null },
    }));
  /** Run a dialog's authorization for `name`, closing the dialog on success. */
  const runDialog = async (
    name: string | null,
    close: (name: null) => void,
    action: (name: string) => Promise<void>
  ) => {
    if (!name || busy.current) return false;
    busy.current = true;
    setPending(name);
    setErrors((previous) => ({ ...previous, [name]: '' }));
    try {
      await action(name);
      useBotUiStore.getState().markMcpChanged(name);
      if (mounted.current) {
        markSignedIn(name);
        close(null);
      }
      await refresh();
      return true;
    } catch (failure) {
      if (mounted.current)
        setErrors((previous) => ({ ...previous, [name]: mcpAuthError(failure) }));
      return false;
    } finally {
      busy.current = false;
      if (mounted.current) setPending(null);
    }
  };
  const authorizeGitHub = (token: string) =>
    runDialog(githubName, setGitHubName, (name) => authorizeGitHubMcp(name, token.trim()));
  const authorizeGoogleToken = (token: string) =>
    runDialog(googleName, setGoogleName, (name) => authorizeGoogleMcp(name, token.trim()));
  const authorizeGoogleClient = (clientId: string, clientSecret: string) =>
    runDialog(googleName, setGoogleName, async (name) => {
      await setKekeMcpOAuthClient(name, clientId.trim(), clientSecret.trim() || undefined);
      await loginKekeMcpServer(name);
    });
  return {
    statuses,
    pending,
    errors,
    error,
    refresh,
    authorize,
    githubName,
    authorizeGitHub,
    dismissGitHub: () => {
      if (!busy.current) setGitHubName(null);
    },
    googleName,
    authorizeGoogleToken,
    authorizeGoogleClient,
    dismissGoogle: () => {
      if (!busy.current) setGoogleName(null);
    },
  };
}
