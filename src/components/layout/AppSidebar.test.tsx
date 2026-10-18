import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLayoutStore } from '@/stores';
import { useAcpStore } from '@/stores/useAcpStore';
import { useBotUiStore } from '@/stores/useBotUiStore';

const createBot = vi.fn();
const updateBot = vi.fn();
const createAutomation = vi.fn();

vi.mock('@/services/apiAdapt/bots', () => ({
  listBots: vi.fn().mockResolvedValue([]),
  createBot: (...args: unknown[]) => createBot(...args),
  listBotSessions: vi.fn().mockResolvedValue([]),
  updateBot: (...args: unknown[]) => updateBot(...args),
  deleteBot: vi.fn(),
  parseBotList: () => [],
}));

vi.mock('@/services/apiAdapt/automation', () => ({
  createAutomation: (...args: unknown[]) => createAutomation(...args),
}));
vi.mock('@/services/apiAdapt/kekeMcp', () => ({
  readKekeMcpServers: vi.fn().mockResolvedValue({ 'github-mcp': { command: 'gh-mcp' } }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/bot', () => ({ SideBarBotPane: () => null }));
vi.mock('@/components/bot/BotNotifications', () => ({ BotNotifications: () => null }));
vi.mock('@/components/pairing/DesktopDrawer', () => ({ DesktopDrawer: () => null }));
vi.mock('@/hooks', () => ({ useTrafficLightConfig: () => ({ isMacos: false }) }));
vi.mock('@/hooks/runtime', () => ({ isPhone: () => false }));
vi.mock('@/features/UpdateIndicator', () => ({ UpdateIndicator: () => null }));
vi.mock('../common/SessionManagerDialog', () => ({ SessionManagerDialog: () => null }));
vi.mock('./SideBarAgentPane', () => ({
  SideBarAgentHeader: () => null,
  SideBarAgentList: () => null,
  SideBarProjectActions: () => null,
}));
vi.mock('./SideBarPinnedList', () => ({ SideBarPinnedList: () => null }));
vi.mock('./UserInfo', () => ({ UserInfo: () => null }));

import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSideBar } from './AppSidebar';

beforeEach(() => {
  vi.clearAllMocks();
  useAcpStore.getState().reset();
  useBotUiStore.setState({ bots: [], selectedBotId: null, newBotOpen: false, connectionByBot: {}, sessionByBot: {} });
});

describe('AppSideBar', () => {
  it('opens the Bots view without creating a bot', () => {
    useLayoutStore.setState({ view: 'agent' });
    render(<SidebarProvider><AppSideBar /></SidebarProvider>);
    fireEvent.click(screen.getByRole('button', { name: /^Bots$/ }));
    expect(useLayoutStore.getState().view).toBe('bot');
    expect(screen.getByRole('button', { name: 'Collapse bots' })).toBeTruthy();
    expect(createBot).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse bots' }));
    expect(useLayoutStore.getState().view).toBe('bot');
  });

  it('opens the New bot page from + without creating a bot', () => {
    useLayoutStore.setState({ view: 'agent' });
    render(
      <SidebarProvider>
        <AppSideBar />
      </SidebarProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'newBot' }));
    expect(useLayoutStore.getState().view).toBe('bot');
    expect(useBotUiStore.getState().newBotOpen).toBe(true);
    expect(createBot).not.toHaveBeenCalled();
  });
});
