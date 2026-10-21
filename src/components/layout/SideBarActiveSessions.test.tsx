import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useCCSessionManager', () => ({
  useCCSessionManager: () => ({ handleSessionSelect: vi.fn() }),
}));
vi.mock('@/services/codexService', () => ({
  codexService: { setCurrentThread: vi.fn(), turnInterrupt: vi.fn() },
}));
vi.mock('@/services/apiAdapt/cc', () => ({ ccInterrupt: vi.fn() }));

import { useCodexStore } from '@/components/codex/stores';
import { useAgentCenterStore } from '@/stores';
import { useCCStore } from '@/stores/cc';
import { SideBarActiveSessions } from './SideBarActiveSessions';

beforeEach(() => {
  useAgentCenterStore.setState({
    cards: [
      { kind: 'codex', id: 'cx-run', preview: 'Refactor parser', cwd: '/work/a' },
      { kind: 'cc', id: 'cc-run', preview: 'Fix flaky test', cwd: '/work/b' },
      { kind: 'codex', id: 'cx-idle', preview: 'Idle thread', cwd: '/work/a' },
    ],
    currentAgentCardId: null,
  });
  useCodexStore.setState({
    threadStatusMap: {
      'cx-run': { type: 'active', activeFlags: [] },
      'cx-idle': { type: 'idle' },
    },
  } as never);
  useCCStore.setState({
    activeSessionIds: ['cc-run'],
    sessionLoadingMap: { 'cc-run': true },
    sessionMessagesMap: {},
  } as never);
});

describe('SideBarActiveSessions', () => {
  it('lists running threads of every agent and skips idle ones', () => {
    render(<SideBarActiveSessions />);
    expect(screen.getByText('Running')).toBeTruthy();
    expect(screen.getByText('Refactor parser')).toBeTruthy();
    expect(screen.getByText('Fix flaky test')).toBeTruthy();
    expect(screen.queryByText('Idle thread')).toBeNull();
  });

  it('is hidden when nothing is active', () => {
    useCodexStore.setState({ threadStatusMap: {} } as never);
    useCCStore.setState({ sessionLoadingMap: {} } as never);
    render(<SideBarActiveSessions />);
    expect(screen.queryByText('Active')).toBeNull();
  });
});
