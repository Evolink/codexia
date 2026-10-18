import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/lib/i18n';
import type { CCMessage } from '../../types/messages';
import { CCTranscript } from './CCTranscript';

vi.mock('@/components/Markdown', () => ({
  Markdown: ({ value }: { value: string }) => <div>{value}</div>,
}));

vi.mock('@/hooks/use-highlighted-code', () => ({
  useHighlightedCode: (value: string) => value.split('\n'),
}));

vi.mock('streamdown', () => ({
  Streamdown: ({ children }: { children: string }) => <div>{children}</div>,
}));

const messages: CCMessage[] = [
  { type: 'user', text: 'Find the bug' },
  {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          id: 't1',
          name: 'Task',
          input: { subagent_type: 'Explore', description: 'Scan the repo', prompt: 'Look around' },
        },
      ],
    },
  },
  {
    type: 'assistant',
    parent_tool_use_id: 't1',
    message: {
      content: [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: '/src/a.ts' } }],
    },
  },
  {
    type: 'user',
    parent_tool_use_id: 't1',
    content: [{ type: 'tool_result', tool_use_id: 'r1', content: 'code' }],
  },
  { type: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'It is in a.ts' }] },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Fixed in a.ts.' }] } },
  {
    type: 'result',
    subtype: 'success',
    duration_ms: 12_300,
    duration_api_ms: 10_000,
    is_error: false,
    num_turns: 2,
    session_id: 's',
  },
];

describe('CCTranscript', () => {
  it('folds the finished turn and nests sub-agent steps under its row', () => {
    render(
      <CCTranscript
        messages={messages}
        isLoading={false}
        showThinking
        renderMessage={() => null}
      />
    );

    // The answer stays visible; the work is folded behind one line.
    expect(screen.getByText('Fixed in a.ts.')).toBeTruthy();
    expect(screen.queryByText('Ran Explore')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Worked for 12.3s/ }));
    fireEvent.click(screen.getByRole('button', { name: /Ran Explore/ }));

    expect(screen.getByText('Look around')).toBeTruthy();
    expect(screen.getByText('Read a.ts')).toBeTruthy();
    expect(screen.getByText('It is in a.ts')).toBeTruthy();
  });
});
