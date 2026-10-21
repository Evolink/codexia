import type { ServerNotification } from '@/bindings';

/**
 * Ids of commands a turn started that have no result yet. Interrupting a turn only
 * ends the turn; a command that was still running keeps going in the background.
 */
export function unfinishedCommandIds(
  events: ServerNotification[] | undefined,
  turnId: string
): string[] {
  const open = new Set<string>();
  for (const event of events ?? []) {
    if (event.method === 'item/started') {
      if (event.params.turnId === turnId && event.params.item.type === 'commandExecution') {
        open.add(event.params.item.id);
      }
    } else if (event.method === 'item/completed') {
      open.delete(event.params.item.id);
    }
  }
  return [...open];
}
