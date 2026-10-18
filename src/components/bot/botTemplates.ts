import type { AutomationSchedule, AutomationWeekday } from '@/services/apiAdapt/automation';
import type { BotTrustLevel } from '@/services/apiAdapt/bots';

/** Something a template relies on, checked (or stated) before it is used. */
export type TemplateNeed =
  /** A keke MCP server whose name contains one of `match`. */
  { kind: 'mcp'; label: string; icon: 'github' | 'google'; match: string[]; optional?: boolean };

export type BotTemplate = {
  id: string;
  group: 'Briefs' | 'Product' | 'Inbox and calendar' | 'Operations' | 'Personal';
  name: string;
  avatar: string;
  color: string;
  title: string;
  /** The role, handed to keke as the bot's instructions. */
  prompt: string;
  trustLevel: BotTrustLevel;
  needs: TemplateNeed[];
  /** Where the bot stops and hands over to you. */
  stopsAt: string;
  routine?: { name: string; prompt: string; schedule: AutomationSchedule };
};

const WEEKDAYS: AutomationWeekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

function daily(hour: number, minute = 0, weekdays: AutomationWeekday[] = []): AutomationSchedule {
  return { mode: 'daily', hour, minute, interval_hours: null, weekdays };
}

const GITHUB: TemplateNeed = { kind: 'mcp', label: 'GitHub', icon: 'github', match: ['github'] };
const GMAIL: TemplateNeed = {
  kind: 'mcp',
  label: 'Gmail',
  icon: 'google',
  match: ['gmail', 'mail'],
};
const CALENDAR: TemplateNeed = {
  kind: 'mcp',
  label: 'Calendar',
  icon: 'google',
  match: ['calendar'],
};
const DRIVE: TemplateNeed = {
  kind: 'mcp',
  label: 'Drive or Sheets',
  icon: 'google',
  match: ['drive', 'sheet'],
};

const HAND_OVER =
  'Never send, post, publish or comment yourself: save it with propose_draft. ' +
  'If a step needs a sign-in, password or code, use hand_back. ' +
  'Payments always need the person, so never try to work around an approval.';

export const BOT_TEMPLATES: BotTemplate[] = [
  {
    id: 'docs-auditor',
    group: 'Product',
    name: 'Docs Auditor',
    avatar: '📚',
    color: '#0891b2',
    title: 'Finds docs that drifted from the code',
    prompt:
      'You compare a repository’s documentation on GitHub with what shipped: merged pull requests and recent commits. Report what is outdated, missing or wrong, with file references and the suggested rewrite as a draft. Ask once which repositories to watch, then remember them. ' +
      HAND_OVER,
    trustLevel: 'read_only',
    needs: [GITHUB],
    stopsAt: 'Report, rewrites as drafts',
    routine: {
      name: 'Weekly docs audit',
      prompt: 'Audit the docs against what changed in the code this week.',
      schedule: daily(15, 0, ['fri']),
    },
  },
  {
    id: 'release-digest',
    group: 'Product',
    name: 'Release Digest',
    avatar: '🗞️',
    color: '#7c3aed',
    title: 'Summarizes what shipped',
    prompt:
      'You read a repository’s merged pull requests and commits on GitHub and summarize what changed for people who do not read commits: features, fixes, and anything that needs attention. Draft release notes with propose_draft when asked. Ask once which repositories to cover, then remember them. ' +
      HAND_OVER,
    trustLevel: 'read_only',
    needs: [GITHUB],
    stopsAt: 'Report, release notes as a draft',
    routine: {
      name: 'Weekly digest',
      prompt: 'Summarize the commits merged this week, grouped by area.',
      schedule: daily(16, 0, ['fri']),
    },
  },
  {
    id: 'daily-brief',
    group: 'Briefs',
    name: 'Daily Brief',
    avatar: '☀️',
    color: '#ea580c',
    title: 'A short morning briefing',
    prompt:
      'You write a short daily briefing on the topics the person cares about. Search the web, prefer primary sources, link every claim, and keep it to what changed since yesterday. Ask once which topics to cover, then remember them. ' +
      HAND_OVER,
    trustLevel: 'read_only',
    needs: [],
    stopsAt: 'Report',
    routine: {
      name: 'Morning brief',
      prompt:
        'Write today’s brief on the topics you remember. Five items at most, each with a link.',
      schedule: daily(8, 0),
    },
  },
  {
    id: 'inbox-triage',
    group: 'Inbox and calendar',
    name: 'Inbox Triage',
    avatar: '📮',
    color: '#2563eb',
    title: 'Sorts mail and drafts replies',
    prompt:
      'You go through new email, say what needs the person and why, and write replies for the ones that need an answer. Every reply is a draft (propose_draft) with the action set to sending it in the original thread; never send mail yourself. ' +
      HAND_OVER,
    trustLevel: 'ask',
    needs: [GMAIL],
    stopsAt: 'Drafts',
    routine: {
      name: 'Morning inbox',
      prompt:
        'Triage the mail that arrived since your last run: what needs me, what can wait, and draft replies where an answer is needed.',
      schedule: daily(8, 30, WEEKDAYS),
    },
  },
  {
    id: 'meeting-prep',
    group: 'Inbox and calendar',
    name: 'Meeting Prep',
    avatar: '📅',
    color: '#0891b2',
    title: 'Prepares you for today’s meetings',
    prompt:
      'Before each meeting, gather what the person needs: who is attending, the last related emails or documents, open questions and a suggested agenda. Never accept, decline or move events yourself; propose changes as drafts. ' +
      HAND_OVER,
    trustLevel: 'read_only',
    needs: [CALENDAR, { ...GMAIL, optional: true }],
    stopsAt: 'Report; calendar changes as drafts',
    routine: {
      name: 'Prep today',
      prompt: 'Prepare a short brief for each of today’s meetings.',
      schedule: daily(7, 30, WEEKDAYS),
    },
  },
  {
    id: 'expense-summary',
    group: 'Operations',
    name: 'Expense Summary',
    avatar: '🧾',
    color: '#16a34a',
    title: 'Summarizes spending',
    prompt:
      'You read the expense sheets and receipts you are given access to and summarize spending by category, flag duplicates, unusual amounts and missing receipts. You never pay, refund or transfer anything. ' +
      HAND_OVER,
    trustLevel: 'read_only',
    needs: [DRIVE],
    stopsAt: 'Report; payments always ask you',
    routine: {
      name: 'Weekly expenses',
      prompt: 'Summarize this week’s expenses and list anything that looks wrong.',
      schedule: daily(17, 0, ['fri']),
    },
  },
  {
    id: 'subscription-review',
    group: 'Personal',
    name: 'Subscription Review',
    avatar: '🔁',
    color: '#db2777',
    title: 'Finds subscriptions worth cancelling',
    prompt:
      'You find recurring charges and subscriptions from receipts and billing emails, list each with its price and last use if known, and recommend which to cancel. You never cancel or change a subscription yourself: cancellation steps go to the person with hand_back. ' +
      HAND_OVER,
    trustLevel: 'read_only',
    needs: [GMAIL],
    stopsAt: 'List; cancelling is handed back to you',
  },
];

/** Gallery order: the everyday roles first. */
export const TEMPLATE_GROUPS = (
  ['Briefs', 'Inbox and calendar', 'Operations', 'Personal', 'Product'] as const
).filter((group) => BOT_TEMPLATES.some((t) => t.group === group));

/** The configured keke MCP servers that satisfy `need`, by name. */
export function matchingServers(need: TemplateNeed, names: string[]) {
  return names.filter((name) => need.match.some((m) => name.toLowerCase().includes(m)));
}

/** The keke selections a template's tools resolve to on this machine. */
export function templateServers(template: BotTemplate, names: string[]) {
  return template.needs.flatMap((need) =>
    matchingServers(need, names)
      .slice(0, 1)
      .map((n) => `keke:${n}`)
  );
}

const DAY_NAMES: Record<AutomationWeekday, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
};

/** "Weekdays 09:00", "Every 2 hours", "Mondays 10:00". */
export function scheduleLabel(schedule: AutomationSchedule) {
  const pad = (n: number | null | undefined) => String(n ?? 0).padStart(2, '0');
  if (schedule.mode === 'interval') return `Every ${schedule.interval_hours ?? 6} hours`;
  const time = `${pad(schedule.hour)}:${pad(schedule.minute)}`;
  const days = schedule.weekdays;
  if (days.length === 0 || days.length === 7) return `Daily ${time}`;
  if (days.length === 5 && WEEKDAYS.every((d) => days.includes(d))) return `Weekdays ${time}`;
  if (days.length === 1) return `${DAY_NAMES[days[0]]}s ${time}`;
  return `${days.join(', ')} ${time}`;
}
