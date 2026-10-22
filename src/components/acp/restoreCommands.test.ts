import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAcpStore } from '@/stores/useAcpStore';
import { restoreAcpCommands } from './restoreCommands';

const getSession = vi.hoisted(() => vi.fn());
vi.mock('@/services/apiAdapt/acp', () => ({ acpGetSession: getSession }));

const commands = (...names: string[]) => ({
  sessionUpdate: 'available_commands_update',
  availableCommands: names.map((name) => ({ name })),
});

describe('restoreAcpCommands', () => {
  beforeEach(() => {
    useAcpStore.getState().reset();
    useAcpStore.setState({ sessionId: 's1' });
  });

  it('applies the last list the session advertised', async () => {
    getSession.mockResolvedValue([commands('old'), { sessionUpdate: 'x' }, commands('new')]);
    await restoreAcpCommands('s1');
    expect(useAcpStore.getState().commands).toEqual([{ name: 'new' }]);
  });

  // Switching from Grok to keke showed Grok's commands under keke.
  it('leaves no commands for a session that advertised none', async () => {
    useAcpStore.setState({ commands: [{ name: 'grok-only' }] });
    getSession.mockResolvedValue([]);
    await restoreAcpCommands('s1');
    expect(useAcpStore.getState().commands).toEqual([]);
  });

  it('ignores a session the pane has already left', async () => {
    getSession.mockResolvedValue([commands('stale')]);
    const pending = restoreAcpCommands('s0');
    await pending;
    expect(useAcpStore.getState().commands).toEqual([]);
  });
});
