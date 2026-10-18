import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bot } from '@/services/apiAdapt/bots';
import { useBotUiStore } from '@/stores/useBotUiStore';

const listBots = vi.fn();
vi.mock('@/services/apiAdapt/bots', () => ({
  listBots: (...args: unknown[]) => listBots(...args),
  parseBotList: () => [],
}));
vi.mock('@/components/acp/useAcpEvents', () => ({ useAcpEvents: () => undefined }));
vi.mock('@/components/ui/sidebar', () => ({
  SidebarTrigger: () => null,
  useSidebar: () => ({ open: false, openMobile: false, isMobile: true }),
}));
vi.mock('@/hooks', () => ({ useTrafficLightConfig: () => ({ needsTrafficLightOffset: false }) }));
vi.mock('./useCreateBot', () => ({
  useCreateBot: () => ({
    creating: false,
    openNewBot: vi.fn(),
    closeNewBot: vi.fn(),
    create: vi.fn(),
  }),
}));
vi.mock('./useOpenBot', () => ({ useOpenBot: () => vi.fn() }));
vi.mock('./useBotDragDrop', () => ({ useBotDragDrop: () => undefined }));
vi.mock('./BotNewPage', () => ({ BotNewPage: () => <h1>New bot</h1> }));
vi.mock('./BotToday', () => ({ BotToday: () => <h1>Today</h1> }));

import BotChatView from './BotChatView';

const brief = { id: 'brief', name: 'Daily Brief' } as Bot;

describe('BotChatView', () => {
  beforeEach(() => {
    listBots.mockReset();
    useBotUiStore.setState({ bots: [], botsLoaded: false, selectedBotId: null, newBotOpen: false });
  });

  it('loads the bots itself, so a phone with the sidebar closed lands on Today', async () => {
    listBots.mockResolvedValue([brief]);
    render(<BotChatView />);
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Create your first bot' })).toBeNull();
  });

  it('does not offer a first bot before the list has loaded', () => {
    listBots.mockReturnValue(new Promise(() => {}));
    render(<BotChatView />);
    expect(screen.queryByRole('heading', { name: 'Create your first bot' })).toBeNull();
  });

  it('welcomes a person who has no bots yet', async () => {
    listBots.mockResolvedValue([]);
    render(<BotChatView />);
    expect(await screen.findByRole('heading', { name: 'Create your first bot' })).toBeTruthy();
  });

  it('shows the New bot page in place of Today while it is open', async () => {
    listBots.mockResolvedValue([brief]);
    useBotUiStore.setState({ newBotOpen: true });
    render(<BotChatView />);
    expect(await screen.findByRole('heading', { name: 'New bot' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Today' })).toBeNull();
  });
});
