// The shell's plugins: their order, which show, spawning each one's actor, and moving between them.
import type { Plugin } from '@apackdev/sdk/fe';
import { HOST_PACK_ID, splitRef } from '@apackdev/sdk/ids';
import type { ShellContext } from './types.ts';

/** `plugins` with the app's own (the host's: the Packs tab) after every pack's, each group in its order */
export function withHostLast(plugins: Plugin[]): Plugin[] {
  const isHost = (plugin: Plugin) => splitRef(plugin.id)?.packId === HOST_PACK_ID;
  return [...plugins.filter((plugin) => !isHost(plugin)), ...plugins.filter(isHost)];
}

/**
 * Spawns a plugin's state machine under its own id as well as its system id. The id is the key the shell tracks the
 * child by: without one every plugin shares a key, the shell holds only the last one spawned, and stopping it stops
 * that one alone while the rest keep running with their system ids taken.
 *
 * XState types `id` from the declared children, and plugins are registered at runtime (built-in and from
 * packs), so the id goes through this one cast rather than at each call site.
 */
export function spawnPluginActor(enqueue: unknown, plugin: Plugin): void {
  const spawner = enqueue as { spawnChild(state: Plugin['state'], options: { id: string; systemId: string }): void };
  spawner.spawnChild(plugin.state, { id: plugin.id, systemId: plugin.id });
}

/** The adjacent declared tab, wrapping around; absent when the current tab is hidden. */
export function neighbourOf<T extends { id: string }>(visible: readonly T[], activePluginId: string, direction: 'up' | 'down'): T | undefined {
  const index = visible.findIndex(plugin => plugin.id === activePluginId);
  if (index === -1) return undefined;
  return visible[(index + (direction === 'up' ? -1 : 1) + visible.length) % visible.length];
}

/** The history after opening `plugin`: moved within it when `historyIndex` is set (back and forward), else extended */
export function historyAfter(
  context: Pick<ShellContext, 'pluginHistory' | 'historyIndex'>,
  plugin: string,
  historyIndex?: number,
): Pick<ShellContext, 'pluginHistory' | 'historyIndex'> {
  if (historyIndex !== undefined) return { pluginHistory: context.pluginHistory, historyIndex };
  const history = context.pluginHistory.slice(0, context.historyIndex + 1);
  if (history[history.length - 1] === plugin) return { pluginHistory: context.pluginHistory, historyIndex: context.historyIndex };
  return { pluginHistory: [...history, plugin], historyIndex: history.length };
}
