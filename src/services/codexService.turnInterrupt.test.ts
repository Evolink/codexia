import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  turnInterrupt: vi.fn(),
  threadBackgroundTerminalsList: vi.fn(),
  threadBackgroundTerminalsTerminate: vi.fn(),
}));
vi.mock('./apiAdapt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./apiAdapt')>()),
  ...api,
}));
const interrupt = api.turnInterrupt;

import type { ServerNotification } from '@/bindings';
import { useCodexStore } from '@/components/codex/stores';
import { codexService } from './codexService';

beforeEach(() => {
  interrupt.mockReset().mockResolvedValue(undefined);
  api.threadBackgroundTerminalsList.mockReset().mockResolvedValue({ data: [], nextCursor: null });
  api.threadBackgroundTerminalsTerminate.mockReset().mockResolvedValue({});
  useCodexStore.setState({
    currentThreadId: 'main',
    currentTurnId: 'turn-main',
    events: {},
  });
});

describe('codexService.turnInterrupt', () => {
  it('clears the running turn of the viewed thread', async () => {
    await codexService.turnInterrupt('main', 'turn-main');
    expect(interrupt).toHaveBeenCalledWith({ threadId: 'main', turnId: 'turn-main' });
    expect(useCodexStore.getState().currentTurnId).toBeNull();
  });

  it('leaves the viewed thread alone when a sub-agent turn is interrupted', async () => {
    await codexService.turnInterrupt('sub-1', 'turn-sub');
    expect(useCodexStore.getState().currentTurnId).toBe('turn-main');
  });

  it('keeps the turn when the interrupt request fails', async () => {
    interrupt.mockRejectedValue(new Error('nope'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(codexService.turnInterrupt('main', 'turn-main')).rejects.toThrow('nope');
    expect(useCodexStore.getState().currentTurnId).toBe('turn-main');
  });

  describe('commands left running', () => {
    const startedCommand = (id: string, turnId = 'turn-main') =>
      ({
        method: 'item/started',
        params: { threadId: 'main', turnId, item: { type: 'commandExecution', id } },
      }) as unknown as ServerNotification;
    const terminal = (itemId: string, processId: string) => ({
      itemId,
      processId,
      command: 'sleep 100',
      cwd: '/p',
      osPid: null,
      cpuPercent: null,
      rssKb: null,
    });

    it('ends only the background commands the interrupted turn left open', async () => {
      useCodexStore.setState({ events: { main: [startedCommand('call-open')] } });
      api.threadBackgroundTerminalsList.mockResolvedValue({
        data: [terminal('call-open', '7'), terminal('call-dev-server', '8')],
        nextCursor: null,
      });
      await codexService.turnInterrupt('main', 'turn-main');
      expect(api.threadBackgroundTerminalsTerminate).toHaveBeenCalledTimes(1);
      expect(api.threadBackgroundTerminalsTerminate).toHaveBeenCalledWith({
        threadId: 'main',
        processId: '7',
      });
    });

    it('does not look at background terminals when the turn left no command open', async () => {
      await codexService.turnInterrupt('main', 'turn-main');
      expect(api.threadBackgroundTerminalsList).not.toHaveBeenCalled();
    });

    it('still succeeds when the background commands cannot be stopped', async () => {
      useCodexStore.setState({ events: { main: [startedCommand('call-open')] } });
      api.threadBackgroundTerminalsList.mockRejectedValue(new Error('experimental api off'));
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await expect(codexService.turnInterrupt('main', 'turn-main')).resolves.toBeUndefined();
    });
  });
});
