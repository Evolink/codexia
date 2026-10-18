import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcpConfigOption } from '@/services/apiAdapt/acp';
import { useAcpStore } from '@/stores/useAcpStore';
import { AcpSessionControls } from './AcpSessionControls';

const setConfigOption = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock('@/services/apiAdapt/acp', () => ({
  acpPrompt: vi.fn(),
  acpSetMode: vi.fn(),
  acpSetConfigOption: (...args: unknown[]) => setConfigOption(...args),
}));

const kekeOptions: AcpConfigOption[] = [
  {
    id: 'session_mode',
    name: 'Session mode',
    type: 'select',
    category: 'mode',
    currentValue: 'default',
    options: [
      { value: 'default', name: 'Normal' },
      { value: 'plan', name: 'Plan' },
    ],
  },
  {
    id: 'approval_policy',
    name: 'Approval mode',
    type: 'select',
    category: 'mode',
    currentValue: 'auto',
    options: [
      { value: 'on-request', name: 'Ask' },
      { value: 'auto', name: 'Automatic review' },
    ],
  },
  {
    id: 'sandbox_mode',
    name: 'Sandbox',
    type: 'select',
    category: 'mode',
    currentValue: 'workspace-write',
    options: [
      { value: 'workspace-write', name: 'Workspace write' },
      { value: 'read-only', name: 'Read only' },
    ],
  },
];

describe('AcpSessionControls', () => {
  beforeEach(() => {
    setConfigOption.mockClear();
    useAcpStore.setState({
      connectionId: 'c1',
      sessionId: 's1',
      configOptions: kekeOptions,
      modes: null,
    });
  });

  it('folds every mode setting into one menu labelled by the non-default one', async () => {
    render(<AcpSessionControls />);

    // One trigger, not a select per setting.
    const trigger = screen.getByRole('button', { name: 'Session mode: Automatic review' });
    expect(screen.getAllByRole('button')).toHaveLength(1);

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Plan' }));

    await waitFor(() =>
      expect(setConfigOption).toHaveBeenCalledWith('c1', 's1', 'session_mode', 'plan')
    );
    expect(screen.getByRole('button', { name: 'Session mode: Plan' })).toBeTruthy();
  });
});
