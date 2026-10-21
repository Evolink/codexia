import { beforeEach, describe, expect, it, vi } from 'vitest';

const interrupt = vi.hoisted(() => vi.fn());
vi.mock('./apiAdapt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./apiAdapt')>()),
  turnInterrupt: interrupt,
}));

import { useCodexStore } from '@/components/codex/stores';
import { codexService } from './codexService';

beforeEach(() => {
  interrupt.mockReset().mockResolvedValue(undefined);
  useCodexStore.setState({ currentThreadId: 'main', currentTurnId: 'turn-main' });
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
});
