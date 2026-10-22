import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcpSessionRecord } from '@/services/apiAdapt/acp';
import { useAcpStore } from '@/stores/useAcpStore';
import { openAcpSession } from './openSession';

const api = vi.hoisted(() => ({
  acpCancel: vi.fn(() => Promise.resolve()),
  acpGetSession: vi.fn(),
  acpLoadSession: vi.fn(),
  acpNewSession: vi.fn(),
  acpStart: vi.fn(),
  acpStop: vi.fn(),
}));
vi.mock('@/services/apiAdapt/acp', () => api);

const record = (sessionId: string): AcpSessionRecord =>
  ({ sessionId, agentId: 'gemini', cwd: '/p' }) as AcpSessionRecord;

describe('openAcpSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.acpCancel.mockResolvedValue(undefined);
    api.acpGetSession.mockResolvedValue([]);
    useAcpStore.getState().reset();
    useAcpStore.setState({ agentId: 'gemini', connectionId: 'c1', canLoadSession: true });
  });

  // Clicking A then B in the sidebar: A's load finishing last must not pull
  // the pane back to A while B's transcript is on screen.
  it('ignores an earlier open that resolves after a later one', async () => {
    let resolveA!: (v: unknown) => void;
    api.acpLoadSession
      .mockImplementationOnce(() => new Promise((r) => (resolveA = r)))
      .mockResolvedValueOnce({ sessionId: 'B' });

    const a = openAcpSession(record('A'));
    await openAcpSession(record('B'));
    resolveA({ sessionId: 'A' });
    await a;

    const s = useAcpStore.getState();
    expect(s.sessionId).toBe('B');
    expect(s.connecting).toBe(false);
  });

  it('cancels the running turn and clears its state before switching', async () => {
    api.acpLoadSession.mockResolvedValue({ sessionId: 'B' });
    useAcpStore.setState({
      sessionId: 'A',
      running: true,
      permission: { requestId: 'r', title: 't', options: [] },
    });

    await openAcpSession(record('B'));

    expect(api.acpCancel).toHaveBeenCalledWith('c1', 'A');
    const s = useAcpStore.getState();
    expect(s.running).toBe(false);
    expect(s.permission).toBeNull();
    expect(s.sessionId).toBe('B');
  });

  // A new connection's event stream subscribes only after the pane re-renders,
  // so the `session/load` replay can be missed: the transcript comes from storage.
  it('renders a loaded session from its stored transcript', async () => {
    useAcpStore.setState({ agentId: 'grok' });
    api.acpStart.mockResolvedValue({
      connectionId: 'c2',
      sessionId: 'fresh',
      session: { sessionId: 'fresh' },
      initialize: { agentCapabilities: { loadSession: true } },
    });
    api.acpLoadSession.mockResolvedValue({ sessionId: 'B' });
    api.acpGetSession.mockResolvedValue([
      { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'hi' } },
      { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hello' } },
    ]);

    await openAcpSession(record('B'));

    const s = useAcpStore.getState();
    expect(s.connectionId).toBe('c2');
    expect(s.sessionId).toBe('B');
    expect(s.entries.map((e) => ('text' in e ? e.text : null))).toEqual(['hi', 'hello']);
  });

  it('shows the stored transcript when the agent cannot load the session', async () => {
    api.acpLoadSession.mockRejectedValue(new Error('Path not found'));
    api.acpNewSession.mockResolvedValue({ sessionId: 'fresh' });
    api.acpGetSession.mockResolvedValue([
      { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'hi' } },
    ]);

    await openAcpSession(record('old'));

    const s = useAcpStore.getState();
    expect(s.sessionId).toBe('fresh');
    expect(s.entries.map((e) => e.role)).toEqual(['user', 'error']);
    expect(s.connecting).toBe(false);
  });
});
