import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CCMessage } from '@/components/cc/types/messages';
import { useCCStore } from '@/stores/cc';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { usePluginsNavigationStore } from '@/stores/usePluginsNavigationStore';

const mcpStatus = vi.fn();
vi.mock('@/services', () => ({ ccMcpStatus: (...args: unknown[]) => mcpStatus(...args) }));

import { CCMcpStatus } from './CCMcpStatus';

const init = {
  type: 'system',
  subtype: 'init',
  plugin_errors: [{ plugin: 'lint@market', type: 'path-not-found', message: 'No such directory' }],
} as CCMessage;

beforeEach(() => {
  vi.clearAllMocks();
  useCCStore.setState({
    activeSessionId: 's1',
    messages: [],
    sessionMessagesMap: { s1: [] },
    sessionLoadingMap: { s1: true },
  });
});

describe('CCMcpStatus', () => {
  it('stays hidden while every server works', async () => {
    mcpStatus.mockResolvedValue({ mcpServers: [{ name: 'docs', status: 'connected' }] });
    useCCStore.setState({ sessionLoadingMap: { s1: false } });
    const { container } = render(<CCMcpStatus sessionId="s1" />);
    await waitFor(() => expect(mcpStatus).toHaveBeenCalledWith('s1'));
    expect(container.innerHTML).toBe('');
  });

  it('reads live status after a turn and lists what is not working', async () => {
    mcpStatus.mockResolvedValue({
      mcpServers: [
        { name: 'docs', status: 'connected' },
        { name: 'linear', status: 'failed', error: 'Connection refused' },
        { name: 'Gmail', status: 'needs-auth' },
        { name: 'claude.ai Drive', status: 'needs-auth', scope: 'claudeai' },
      ],
    });
    render(<CCMcpStatus sessionId="s1" />);
    // Not read during the turn.
    expect(mcpStatus).not.toHaveBeenCalled();

    act(() =>
      useCCStore.setState({ sessionMessagesMap: { s1: [init] }, sessionLoadingMap: { s1: false } })
    );
    fireEvent.click(await screen.findByRole('button', { name: '3 tools not working' }));

    expect(screen.getByText('linear')).toBeTruthy();
    expect(screen.getByText('Connection refused')).toBeTruthy();
    expect(screen.getByText('Needs sign-in')).toBeTruthy();
    expect(screen.getByText('lint@market')).toBeTruthy();
    expect(screen.queryByText('docs')).toBeNull();
    expect(screen.queryByText('claude.ai Drive')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Manage connectors' }));
    expect(usePluginsNavigationStore.getState().mainTab).toBe('Connectors');
    expect(useLayoutStore.getState().view).toBe('plugins');
  });
});
