/**
 * Local mirror of the `thinking` block types so helper files in this
 * directory can typecheck before the backend `defs/` rollup is regenerated.
 *
 * Kept in sync with `packages/api/src/systems/threads/types.ts`. If the
 * canonical shape changes, mirror it here too.
 */

export interface ThinkingBlockProps {
  /** Accumulated thinking text. */
  content: string;
  /** Collapsed header label (e.g. "Thinking…" or "Thought for 3s"). */
  label: string;
  /** Block state — drives spinner visibility. */
  state: 'streaming' | 'done';
  /** Initial open/closed state. Collapsed by default. */
  defaultOpen?: boolean;
}
