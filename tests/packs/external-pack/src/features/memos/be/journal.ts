// What this feature holds open while the pack runs, as a pack holds a connection or a file handle: its
// lifecycle's onInit opens it and onShutdown closes it (./lifecycle.ts)
let entries: string[] | undefined;
let opened = 0;

export const journal = {
  get isOpen(): boolean {
    return entries !== undefined;
  },
  /** How many times the pack's backend opened it */
  get timesOpened(): number {
    return opened;
  },
  open(): void {
    entries = [];
    opened++;
  },
  close(): void {
    entries = undefined;
  },
};
