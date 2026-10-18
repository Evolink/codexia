import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bot } from '@/services/apiAdapt/bots';
import { useBotUiStore } from '@/stores/useBotUiStore';
import { BotSignIn } from './BotSignIn';
import { hasSignedInRoute } from './signedIn';

const acpAuthenticate = vi.fn();
const acpNewSession = vi.fn();
vi.mock('@/services/apiAdapt/acp', () => ({
  acpAuthenticate: (...args: unknown[]) => acpAuthenticate(...args),
  acpNewSession: (...args: unknown[]) => acpNewSession(...args),
}));

const bot = { id: 'brief', name: 'Daily Brief', cwd: '' } as Bot;
const methods = [
  { id: 'anthropic', name: 'Anthropic', _meta: { signedIn: false, apiKeyVar: 'ANTHROPIC_API_KEY' } },
  { id: 'codex', name: 'ChatGPT', _meta: { signedIn: false } },
];

describe('BotSignIn', () => {
  beforeEach(() => {
    acpAuthenticate.mockReset().mockResolvedValue(undefined);
    acpNewSession.mockReset().mockResolvedValue({ sessionId: 's1' });
    useBotUiStore.setState({ selectedBotId: 'brief', sessionByBot: {} });
  });

  it('signs in with ChatGPT and opens the session in the bot folder', async () => {
    render(<BotSignIn bot={bot} connectionId="c1" methods={methods} />);
    fireEvent.click(screen.getByRole('button', { name: /ChatGPT/ }));
    await waitFor(() => expect(useBotUiStore.getState().sessionByBot.brief).toBe('s1'));
    expect(acpAuthenticate).toHaveBeenCalledWith('c1', 'codex', { apiKey: undefined });
    expect(acpNewSession).toHaveBeenCalledWith('c1', '');
  });

  it('asks for an API key instead of a login for a key route', async () => {
    render(<BotSignIn bot={bot} connectionId="c1" methods={methods} />);
    expect(screen.getByRole('button', { name: /Anthropic/ }).textContent).toContain('Add API key');
    fireEvent.click(screen.getByRole('button', { name: /Anthropic/ }));
    expect(acpAuthenticate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Anthropic API key'), { target: { value: 'sk-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(acpAuthenticate).toHaveBeenCalledWith('c1', 'anthropic', { apiKey: 'sk-1' })
    );
  });

  it('shows why a sign-in failed next to the buttons', async () => {
    acpAuthenticate.mockRejectedValue(new Error('login cancelled'));
    render(<BotSignIn bot={bot} connectionId="c1" methods={methods} />);
    fireEvent.click(screen.getByRole('button', { name: /ChatGPT/ }));
    expect(await screen.findByText(/login cancelled/)).toBeTruthy();
  });
});

describe('hasSignedInRoute', () => {
  it('counts a stored credential, not a route that needs none', () => {
    expect(hasSignedInRoute([{ id: 'ollama', name: 'Ollama', _meta: { signedIn: true } }])).toBe(false);
    expect(
      hasSignedInRoute([
        { id: 'codex', name: 'ChatGPT', _meta: { signedIn: true, credentialSource: 'oauth' } },
      ])
    ).toBe(true);
  });
});
