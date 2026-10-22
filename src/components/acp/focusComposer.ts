export const ACP_INPUT_FOCUS_EVENT = 'acp-input-focus-request';

/** How long a focus request also applies to a composer that mounts later. */
const PENDING_MS = 10_000;
let requestedAt = 0;

/**
 * Ask the ACP composer to take focus. Opening a session can swap the pane's
 * layout, which mounts a new composer after the request went out; that one
 * takes focus on mount while the request is recent (`focusRequestPending`).
 */
export function focusAcpComposer() {
  requestedAt = Date.now();
  requestAnimationFrame(() => window.dispatchEvent(new Event(ACP_INPUT_FOCUS_EVENT)));
}

export function focusRequestPending() {
  return Date.now() - requestedAt < PENDING_MS;
}

/** The person started typing: a later remount must not move the caret. */
export function settleFocusRequest() {
  requestedAt = 0;
}
