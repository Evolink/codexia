import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAcpStore } from '@/stores/useAcpStore';

const useAcpEvents = vi.fn();
vi.mock('@/components/acp/useAcpEvents', () => ({
  useAcpEvents: (connectionId: string | null) => useAcpEvents(connectionId),
}));
vi.mock('./AgentComposer', () => ({ AgentComposer: () => null }));
vi.mock('./AgentPicker', () => ({ AgentPicker: () => null }));
vi.mock('./AgentViewHeader', () => ({ AgentViewHeader: () => null }));

import AgentView from './AgentView';

describe('AgentView', () => {
  beforeEach(() => {
    useAcpEvents.mockReset();
  });

  // Switching sessions clears the entries before `session/load` replays the
  // transcript; the pane shows the empty layout meanwhile, and the replay is
  // lost unless something is still listening.
  it('keeps the ACP subscription while an opened session has no entries yet', () => {
    useAcpStore.setState({ active: true, connectionId: 'c1', sessionId: 's1', entries: [] });

    render(<AgentView />);

    expect(useAcpEvents).toHaveBeenLastCalledWith('c1');
  });

  it('does not subscribe when ACP is not driving the pane', () => {
    useAcpStore.setState({ active: false, connectionId: 'c1', sessionId: 's1', entries: [] });

    render(<AgentView />);

    expect(useAcpEvents).toHaveBeenLastCalledWith(null);
  });
});
