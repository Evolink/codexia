import { BookOpen, CircleDashed, Compass, Globe, Hash, Layers, Plug, Search } from 'lucide-react';
import githubIcon from '@/assets/github.svg';

const icons = {
  slack: Hash,
  linear: CircleDashed,
  context7: BookOpen,
  deepwiki: BookOpen,
  'you-search': Search,
  'parallel-search': Layers,
  'keenable-search': Compass,
};

export function ConnectorIcon({ name }: { name: string }) {
  if (name === 'github') return <img src={githubIcon} alt="" className="size-5" />;
  const Icon = icons[name as keyof typeof icons] ?? (name.includes('http') ? Globe : Plug);
  return <Icon className="size-5" aria-hidden />;
}
