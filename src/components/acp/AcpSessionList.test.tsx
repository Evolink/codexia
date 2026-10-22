import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AcpSessionList } from './AcpSessionList';
import { ACP_INPUT_FOCUS_EVENT } from './focusComposer';

const open = vi.fn();
vi.mock('./useAcpSessions', () => ({
  useAcpSessions: () => ({
    sessions: [
      { sessionId: 's1', agentId: 'grok', cwd: '/p', title: 'fix it', updatedAt: '2026-10-22' },
    ],
    opening: null,
    open,
    remove: vi.fn(),
  }),
}));

// Picking a session is picking what to say next to it.
it('focuses the composer when a session is picked', async () => {
  const focusRequested = vi.fn();
  window.addEventListener(ACP_INPUT_FOCUS_EVENT, focusRequested);
  render(<AcpSessionList directory="/p" />);

  fireEvent.click(screen.getByRole('button', { name: /fix it/ }));
  await new Promise((r) => requestAnimationFrame(r));

  expect(open).toHaveBeenCalled();
  expect(focusRequested).toHaveBeenCalled();
  window.removeEventListener(ACP_INPUT_FOCUS_EVENT, focusRequested);
});
