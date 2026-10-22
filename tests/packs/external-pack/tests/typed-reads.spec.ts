// Reading another pack's surface state with types — the half of a surface's contract that isn't events.
//
// `#generated/fe` generates a reader per pack from the contracts it can see: this pack's own surfaces by feature id,
// and a dependency's as `<dependency>/<feature>`, typed from that dependency's published `PackSurfaceState`. This is
// the only place the cross-pack read is exercised; within a pack the same reader answers from the pack's own
// contracts, which the app's own features use everywhere.
import { describe, expect, it } from 'vitest';
import { readSurfaceState, useSurfaceState } from '#generated/fe.ts';

describe('typed reads of a surface state', () => {
  it('types a dependency read from that pack\'s published state, and its own as always present', () => {
    // Never called: tsc checks these lines when it runs over the pack's tests
    const reads = () => {
      // A dependency's frontend may still be loading, so what comes back may be undefined — and the type says so
      const openNote: string | null | undefined = readSurfaceState('default-setup/notes', (s) => s.currentNoteId);
      const notes = useSurfaceState('default-setup/notes', (s) => s.notes);
      // @ts-expect-error a dependency's state is `T | undefined`: this pack cannot assume that frontend has loaded
      const assumed: { length: number } = notes.value;

      // This pack ships its own surface with its frontend, so its state is never undefined
      const memos = useSurfaceState('memos', (s) => s.memos);
      const counted: number = memos.value.length;

      // @ts-expect-error `highlighted` is on the contract; `nonsense` is not
      readSurfaceState('memos', (s) => s.nonsense);
      // @ts-expect-error a dependency's surface is named <dependency>/<feature>
      readSurfaceState('notes', (s) => s.currentNoteId);

      return [openNote, assumed, counted];
    };
    expect(reads).toBeTypeOf('function');
  });
});
