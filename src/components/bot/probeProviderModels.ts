import {
  acpAuthenticate,
  acpDeleteSession,
  acpNewSession,
  acpStart,
  acpStop,
} from '@/services/apiAdapt/acp';
import { captureBotOptions, useBotOptionsStore } from '@/stores/useBotOptionsStore';

/** The provider has no credential, and asking keke to use it would start a login flow. */
export class ProviderNotSignedInError extends Error {}

/**
 * Ask keke which models a provider serves, for a bot that has never run on it.
 *
 * keke reports models per route and only over a live connection, and the route
 * is chosen with `authenticate`, so this spawns a throwaway process, switches
 * it to `provider`, reads the new session's catalogue into the cache and shuts
 * the process down again.
 *
 * Throws `ProviderNotSignedInError` instead of authenticating when keke says
 * there is no credential: `authenticate` would open a browser login, which a
 * background lookup must not do.
 */
export async function probeProviderModels(provider: string, cwd: string) {
  const started = await acpStart('keke', cwd);
  const sessionIds = [started.sessionId];
  try {
    const method = started.initialize.authMethods?.find((m) => m.id === provider);
    if (method?._meta?.signedIn === false) throw new ProviderNotSignedInError(provider);

    await acpAuthenticate(started.connectionId, provider);
    const session = await acpNewSession(started.connectionId, cwd);
    sessionIds.push(session.sessionId);
    captureBotOptions(provider, started.initialize, session);
  } finally {
    await acpStop(started.connectionId).catch(() => {});
    // Both sessions were recorded as ordinary conversations; neither is one.
    for (const id of sessionIds) {
      if (id) await acpDeleteSession(id).catch(() => {});
    }
  }
}
/**
 * Ask keke which accounts it offers, so a bot can be set up before any bot
 * has run. The default route's models come along with the session.
 */
export async function probeAccounts() {
  const started = await acpStart('keke', '');
  try {
    captureBotOptions('', started.initialize, started.session);
  } finally {
    await acpStop(started.connectionId).catch(() => {});
    if (started.sessionId) await acpDeleteSession(started.sessionId).catch(() => {});
  }
}

/**
 * Make `account` keke's default route, signing in first when it has no
 * credential (which may open a browser login), or storing `apiKey` for a route
 * that takes a key. Bots without a model of their own then run on it.
 */
export async function chooseDefaultAccount(account: string, apiKey?: string) {
  const started = await acpStart('keke', '');
  const sessionIds = [started.sessionId];
  try {
    await acpAuthenticate(started.connectionId, account, { remember: true, apiKey });
    const session = await acpNewSession(started.connectionId, '');
    sessionIds.push(session.sessionId);
    captureBotOptions(account, started.initialize, session);
    // The list keke sent at start predates the login.
    const store = useBotOptionsStore.getState();
    store.setCatalogue(account, {
      authMethods: store.authMethods.map((m) =>
        m.id === account ? { ...m, _meta: { ...m._meta, signedIn: true } } : m
      ),
      configOptions: [],
      models: null,
    });
    store.setDefaultAccount(account);
  } finally {
    await acpStop(started.connectionId).catch(() => {});
    await Promise.all(
      sessionIds.flatMap((id) => (id ? [acpDeleteSession(id).catch(() => {})] : []))
    );
  }
}
