import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBotOptionsStore } from '@/stores/useBotOptionsStore';
import { BotWelcome } from './BotWelcome';

const probe = vi.hoisted(() => ({
  probeAccounts: vi.fn(),
  chooseDefaultAccount: vi.fn(),
}));
vi.mock('./probeProviderModels', () => probe);

const ACCOUNTS = [
  { id: 'codex', name: 'ChatGPT', _meta: { signedIn: true } },
  { id: 'grok', name: 'Grok', _meta: { signedIn: false } },
];

describe('BotWelcome', () => {
  beforeEach(() => {
    probe.probeAccounts.mockReset().mockResolvedValue(undefined);
    probe.chooseDefaultAccount.mockReset().mockImplementation(async (id: string) => {
      useBotOptionsStore.getState().setDefaultAccount(id);
    });
    useBotOptionsStore.setState({ authMethods: ACCOUNTS, byProvider: {}, defaultAccount: '' });
  });

  it('asks for an account before the first bot can be created', async () => {
    const create = vi.fn();
    render(<BotWelcome creating={false} onCreate={create} />);
    expect(screen.getByRole('heading', { name: 'Create your first bot' })).toBeTruthy();
    const createButton = screen.getByRole('button', { name: 'Create bot' });
    expect(createButton.hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Grok/ }));
    expect(probe.chooseDefaultAccount).toHaveBeenCalledWith('grok', undefined);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Grok/ }).getAttribute('aria-pressed')).toBe(
        'true'
      )
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create bot' }));
    expect(create).toHaveBeenCalledOnce();
  });

  it('shows why an account could not be chosen', async () => {
    probe.chooseDefaultAccount.mockRejectedValue(new Error('login cancelled'));
    render(<BotWelcome creating={false} onCreate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /ChatGPT/ }));
    expect(await screen.findByText(/login cancelled/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create bot' }).hasAttribute('disabled')).toBe(true);
  });

  it('still allows creating when keke lists no accounts', async () => {
    useBotOptionsStore.setState({ authMethods: [] });
    render(<BotWelcome creating={false} onCreate={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create bot' }).hasAttribute('disabled')).toBe(
        false
      )
    );
  });

  it('disables creating while a bot is being created', () => {
    useBotOptionsStore.setState({ defaultAccount: 'codex' });
    render(<BotWelcome creating onCreate={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Creating…' }).hasAttribute('disabled')).toBe(true);
  });
});
