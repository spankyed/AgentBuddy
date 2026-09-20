/**
 * What the loader says about a pack, as sentences rather than string literals at the point of logging.
 *
 * `@abuddy/testing` reads these out of the app's output to tell whether the pack under test came up: it
 * is the only signal a backend-only pack leaves, since it registers no plugin and is left out of the
 * loaded packs the renderer is served. Importing the same builders on both sides makes a reword a change
 * to both, instead of a pack author's suite failing thirty seconds later with the wrong reason.
 *
 * Beside the pack runtime rather than in it: the `./packs` barrel exports these for the harness, and the
 * CLI imports that barrel, which must not reach the loader (`tests/boundaries.spec.ts`).
 */

/** A pack registered with everything it contributes, and its systems started. */
export function packRegistered(packId: string, systemCount: number): string {
  return `Registered pack: ${packId} (${systemCount} systems)`;
}

/** A pack the loader reached and could not use, whatever the reason that follows. */
export function packLoadFailed(packId: string): string {
  return `Failed to register pack ${packId}`;
}

/** The fragments a reader matches on, without the parts that vary. */
export const PACK_LOAD_MESSAGES = {
  registered: 'Registered pack:',
  /** What the loader says when it skips or cannot load a pack, each followed by the pack's id */
  notLoaded: ['Skipping', 'Failed to load', 'Failed to register pack'],
} as const;
