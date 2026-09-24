// What the pack's backend holds open while it runs, as a pack holds a connection or a file handle: boot.onInit opens
// it and boot.onShutdown closes it (src/features/hooks.ts)
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
