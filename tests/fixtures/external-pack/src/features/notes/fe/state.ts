// A plugin-only feature whose id default-setup already has: two packs, one `notes` feature each, and
// each plugin runs under its own pack's id. Nothing here talks to a system — what it proves is the
// addressing, so it stays the smallest plugin that can be navigated to and read.
import { busId } from '#generated/bus-ids';
import { setup, type ActorRefFrom } from 'xstate';

export const id = busId.notes;

const notesState = setup({
  types: { context: {} as { label: string } },
}).createMachine({
  id,
  context: { label: "the fixture's own notes" },
});

export type NotesState = ActorRefFrom<typeof notesState>;
export default notesState;
