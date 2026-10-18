import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLayoutStore } from '@/stores';
import { useBotUiStore } from '@/stores/useBotUiStore';
import type { BotTemplate } from './botTemplates';
import { type BotDraft, useCreateBot } from './useCreateBot';

const createBot = vi.fn();
const updateBot = vi.fn();
const createAutomation = vi.fn();
vi.mock('@/services/apiAdapt/bots', () => ({
  createBot: (...args: unknown[]) => createBot(...args),
  updateBot: (...args: unknown[]) => updateBot(...args),
}));
vi.mock('@/services/apiAdapt/automation', () => ({
  createAutomation: (...args: unknown[]) => createAutomation(...args),
}));

const routine = { name: 'Morning brief', prompt: 'brief', schedule: { mode: 'daily' } };
const role = {
  name: 'Daily Brief',
  title: 'Briefs',
  prompt: 'p',
  avatar: 'a',
  color: 'c',
  trustLevel: 'read_only',
  routine,
} as unknown as BotTemplate;

const draft = (patch: Partial<BotDraft>): BotDraft => ({
  template: null,
  name: 'Bot 1',
  title: '',
  avatar: '🤖',
  color: '#000',
  description: '',
  cwd: '',
  servers: [],
  routine: true,
  ...patch,
});

describe('useCreateBot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBotUiStore.setState({ bots: [], selectedBotId: null, newBotOpen: false });
    createBot.mockImplementation(async (bot) => ({ ...bot, agentId: 'keke' }));
    updateBot.mockImplementation(async (id, patch) => ({ id, agentId: 'keke', ...patch }));
  });

  it('opens the New bot page without creating anything', () => {
    useLayoutStore.setState({ view: 'agent' });
    const { result } = renderHook(() => useCreateBot());
    act(() => result.current.openNewBot());
    expect(useBotUiStore.getState().newBotOpen).toBe(true);
    expect(useLayoutStore.getState().view).toBe('bot');
    act(() => result.current.closeNewBot());
    expect(useBotUiStore.getState().newBotOpen).toBe(false);
    expect(createBot).not.toHaveBeenCalled();
  });

  it('creates a role with no project folder, its tools and its routine, then opens it', async () => {
    useBotUiStore.setState({ newBotOpen: true });
    const { result } = renderHook(() => useCreateBot());
    await act(() => result.current.create(draft({ template: role, servers: ['keke:gmail'] })));
    expect(createBot).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Bot 1', cwd: '', trustLevel: 'read_only' })
    );
    expect(updateBot).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ title: 'Briefs', systemPrompt: 'p', mcpServers: ['keke:gmail'] })
    );
    expect(createAutomation).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Morning brief', agent: 'bot', projects: [] })
    );
    expect(useBotUiStore.getState().selectedBotId).toBeTruthy();
    expect(useBotUiStore.getState().newBotOpen).toBe(false);
  });

  it('skips the routine when it is unticked', async () => {
    const { result } = renderHook(() => useCreateBot());
    await act(() => result.current.create(draft({ template: role, routine: false })));
    expect(createAutomation).not.toHaveBeenCalled();
  });

  it('turns a described bot into its instructions and role', async () => {
    const { result } = renderHook(() => useCreateBot());
    await act(() =>
      result.current.create(
        draft({ description: 'Watch Rust releases. Tell me what matters.' })
      )
    );
    expect(updateBot).toHaveBeenCalledWith(expect.any(String), {
      title: 'Watch Rust releases',
      systemPrompt: 'Watch Rust releases. Tell me what matters.',
    });
  });
});
