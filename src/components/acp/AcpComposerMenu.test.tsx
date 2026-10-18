import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAcpStore } from '@/stores/useAcpStore';
import { AcpComposerMenu } from './AcpComposerMenu';

const setConfigOption = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock('@/services/apiAdapt/acp', () => ({
  acpSetConfigOption: (...args: unknown[]) => setConfigOption(...args),
}));
// The web build: no native dialog, no screenshots.
vi.mock('@/hooks/runtime', () => ({ isTauri: () => false, isDesktopTauri: () => false }));

describe('AcpComposerMenu on the web', () => {
  beforeEach(() => {
    setConfigOption.mockClear();
    useAcpStore.setState({
      connectionId: 'c1',
      sessionId: 's1',
      configOptions: [
        { id: 'web_search', name: 'Web search', type: 'boolean', category: '_tools', currentValue: false },
      ],
    });
  });

  it('offers tools, images and an @ file search from the plus button', async () => {
    const onMentionFile = vi.fn();
    render(
      <AcpComposerMenu
        onImagesSelected={vi.fn()}
        onFilesSelected={vi.fn()}
        onMentionFile={onMentionFile}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('button', { name: 'Add images' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Web search' }));
    await waitFor(() =>
      expect(setConfigOption).toHaveBeenCalledWith('c1', 's1', 'web_search', true)
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mention a file' }));
    expect(onMentionFile).toHaveBeenCalled();
  });

  it('leaves images out for an agent that does not accept them', async () => {
    render(<AcpComposerMenu onFilesSelected={vi.fn()} onMentionFile={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByRole('button', { name: 'Mention a file' });
    expect(screen.queryByRole('button', { name: 'Add images' })).toBeNull();
  });
});
