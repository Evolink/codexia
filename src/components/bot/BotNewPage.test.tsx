import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBotUiStore } from '@/stores/useBotUiStore';

vi.mock('@/services/apiAdapt/kekeMcp', () => ({
  readKekeMcpServers: vi.fn().mockResolvedValue({ 'gmail-work': { command: 'gmail-mcp' } }),
}));

import { BotNewPage } from './BotNewPage';

const onCreate = vi.fn();
const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useBotUiStore.setState({ bots: [] });
});

describe('BotNewPage', () => {
  it('creates nothing when closed', () => {
    render(<BotNewPage creating={false} onClose={onClose} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use Inbox Triage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('never asks for a project folder', () => {
    render(<BotNewPage creating={false} onClose={onClose} onCreate={onCreate} />);
    expect(screen.queryByText(/folder/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Use Release Digest' }));
    expect(screen.queryByText(/folder/i)).toBeNull();
  });

  it('creates a role with its connected tools once confirmed', async () => {
    render(<BotNewPage creating={false} onClose={onClose} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use Inbox Triage' }));
    expect(await screen.findByText('Connected')).toBeTruthy();
    expect(onCreate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Create bot' }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Inbox Triage',
        cwd: '',
        servers: ['keke:gmail-work'],
        routine: true,
      })
    );
  });

  it('offers to connect a missing integration', async () => {
    render(<BotNewPage creating={false} onClose={onClose} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use Release Digest' }));
    expect(await screen.findByRole('button', { name: 'Connect' })).toBeTruthy();
  });

  it('turns a description into a bot after review', () => {
    render(<BotNewPage creating={false} onClose={onClose} onCreate={onCreate} />);
    const go = screen.getByRole('button', { name: 'Continue' });
    expect(go.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('What should this bot take care of?'), {
      target: { value: 'Watch Rust releases' },
    });
    fireEvent.click(go);
    fireEvent.click(screen.getByRole('button', { name: 'Create bot' }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ template: null, name: 'Bot 1', description: 'Watch Rust releases' })
    );
  });

  it('lets the avatar and role be changed before creating', () => {
    render(<BotNewPage creating={false} onClose={onClose} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use Inbox Triage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Avatar 🦊' }));
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Mail sorter' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create bot' }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ avatar: '🦊', title: 'Mail sorter' })
    );
  });
});
