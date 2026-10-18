import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBotOptionsStore } from '@/stores/useBotOptionsStore';

vi.mock('./probeProviderModels', () => ({
  probeAccounts: vi.fn().mockResolvedValue(undefined),
  probeProviderModels: vi.fn().mockResolvedValue(undefined),
}));

import { BotModelPicker } from './BotModelPicker';

const props = { provider: '', model: '', reasoningEffort: '', onChange: vi.fn() };

beforeEach(() => useBotOptionsStore.setState({ authMethods: [], byProvider: {} }));

describe('BotModelPicker', () => {
  it('sends the person to the chat to sign in when no account is signed in', () => {
    useBotOptionsStore.setState({
      authMethods: [{ id: 'codex', name: 'ChatGPT', _meta: { signedIn: false } }],
    });
    render(<BotModelPicker {...props} />);
    expect(screen.getByText(/Sign in from the bot.s chat/)).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('offers one model menu with no account picker', () => {
    useBotOptionsStore.setState({
      authMethods: [{ id: 'codex', name: 'ChatGPT', _meta: { signedIn: true } }],
    });
    render(<BotModelPicker {...props} />);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: 'Model' }).textContent).toContain('Default');
    expect(screen.queryByText('Automatic')).toBeNull();
  });
});
