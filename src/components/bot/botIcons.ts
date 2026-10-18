import AnthropicIcon from '@/assets/claudecode-color.svg';
import CodexIcon from '@/assets/codex-color.svg';
import GeminiIcon from '@/assets/gemini-color.svg';
import GithubIcon from '@/assets/github.svg';
import GoogleIcon from '@/assets/google-color.svg';
import MiniMaxIcon from '@/assets/minimax-color.svg';
import NvidiaIcon from '@/assets/nvidia-color.svg';
import OllamaIcon from '@/assets/ollama.svg';
import OpenAIIcon from '@/assets/openai.svg';
import OpenRouterIcon from '@/assets/openrouter.svg';
import XIcon from '@/assets/x.svg';

export const INTEGRATION_ICONS = { github: GithubIcon, google: GoogleIcon } as const;

/** Most specific first: `codex` is ChatGPT's route, `openai` the API key one. */
const PROVIDER_ICONS: Array<[string[], string]> = [
  [['codex', 'chatgpt'], CodexIcon],
  [['openrouter'], OpenRouterIcon],
  [['openai'], OpenAIIcon],
  [['anthropic', 'claude'], AnthropicIcon],
  [['gemini', 'google'], GeminiIcon],
  [['xai', 'grok'], XIcon],
  [['ollama'], OllamaIcon],
  [['nvidia'], NvidiaIcon],
  [['minimax'], MiniMaxIcon],
];

/** The logo for a keke route, matched on its id or name; `null` when unknown. */
export function providerIcon(id: string, name = '') {
  const text = `${id} ${name}`.toLowerCase();
  return PROVIDER_ICONS.find(([keys]) => keys.some((k) => text.includes(k)))?.[1] ?? null;
}
