// The shell's surfaces: their order, which show, spawning each one's actor, and moving between them.
import type { Surface } from '@apackdev/sdk/fe';
import { HOST_PACK_ID, splitRef } from '@apackdev/sdk/ids';
import type { ShellContext } from './types.ts';

/** `surfaces` with the app's own (the host's: the Packs tab) after every pack's, each group in its order */
export function withHostLast(surfaces: Surface[]): Surface[] {
  const isHost = (surface: Surface) => splitRef(surface.id)?.packId === HOST_PACK_ID;
  return [...surfaces.filter((surface) => !isHost(surface)), ...surfaces.filter(isHost)];
}

/**
 * Spawns a surface's state machine under its own id as well as its system id. The id is the key the shell tracks the
 * child by: without one every surface shares a key, the shell holds only the last one spawned, and stopping it stops
 * that one alone while the rest keep running with their system ids taken.
 *
 * XState types `id` from the declared children, and surfaces are registered at runtime (built-in and from
 * packs), so the id goes through this one cast rather than at each call site.
 */
export function spawnSurfaceActor(enqueue: unknown, surface: Surface): void {
  const spawner = enqueue as { spawnChild(state: Surface['state'], options: { id: string; systemId: string }): void };
  spawner.spawnChild(surface.state, { id: surface.id, systemId: surface.id });
}

/** The adjacent declared tab, wrapping around; absent when the current tab is hidden. */
export function neighbourOf<T extends { id: string }>(visible: readonly T[], activeSurfaceId: string, direction: 'up' | 'down'): T | undefined {
  const index = visible.findIndex(surface => surface.id === activeSurfaceId);
  if (index === -1) return undefined;
  return visible[(index + (direction === 'up' ? -1 : 1) + visible.length) % visible.length];
}

/** The history after opening `surface`: moved within it when `historyIndex` is set (back and forward), else extended */
export function historyAfter(
  context: Pick<ShellContext, 'surfaceHistory' | 'historyIndex'>,
  surface: string,
  historyIndex?: number,
): Pick<ShellContext, 'surfaceHistory' | 'historyIndex'> {
  if (historyIndex !== undefined) return { surfaceHistory: context.surfaceHistory, historyIndex };
  const history = context.surfaceHistory.slice(0, context.historyIndex + 1);
  if (history[history.length - 1] === surface) return { surfaceHistory: context.surfaceHistory, historyIndex: context.historyIndex };
  return { surfaceHistory: [...history, surface], historyIndex: history.length };
}
