// Reading another pack's plugin state with types — the half of a plugin's contract that isn't events.
//
// `#generated/fe` generates a reader per pack from the contracts it can see: this pack's own plugins by feature id,
// and a dependency's as `<dependency>/<feature>`, typed from that dependency's published `PackPluginState`. This is
// the only place the cross-pack read is exercised; within a pack the same reader answers from the pack's own
// contracts, which the app's own features use everywhere.
import { describe, expect, it } from 'vitest';
import { readPluginState, usePluginState } from '#generated/fe';

describe('typed reads of a plugin state', () => {
  it('types a dependency read from that pack\'s published state, and its own as always present', () => {
    // Never called: tsc checks these lines when it runs over the pack's tests
    const reads = () => {
      // A dependency's frontend may still be loading, so what comes back may be undefined — and the type says so
      const openNote: string | null | undefined = readPluginState('default-setup/notes', (s) => s.currentNoteId);
      const notes = usePluginState('default-setup/notes', (s) => s.notes);
      // @ts-expect-error a dependency's state is `T | undefined`: this pack cannot assume that frontend has loaded
      const assumed: { length: number } = notes.value;

      // This pack ships its own plugin with its frontend, so its state is never undefined
      const memos = usePluginState('memos', (s) => s.memos);
      const counted: number = memos.value.length;

      // @ts-expect-error `highlighted` is on the contract; `nonsense` is not
      readPluginState('memos', (s) => s.nonsense);
      // @ts-expect-error a dependency's plugin is named <dependency>/<feature>
      readPluginState('notes', (s) => s.currentNoteId);

      return [openNote, assumed, counted];
    };
    expect(reads).toBeTypeOf('function');
  });
});
