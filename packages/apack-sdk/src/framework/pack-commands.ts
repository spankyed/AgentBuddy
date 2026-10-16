/**
 * Eligible declared slash commands (apack.json `extensions.commands`). The chat lists them beside the
 * commands its library documents give, and sending one fires a `user.command` event the declaring
 * pack's flows handle. Catalog changes and runtime lifecycle notifications refresh the picker.
 */
import { boundHost } from '../runtime/host-runtime.ts';

/** A slash command: the name typed after the `/`, and what the chat shows after it */
export interface PackCommand {
  name: string;
  placeholder: string;
}

/** Enabled declarations matching active runtimes, in stable catalog admission order. */
export function getPackCommands(): PackCommand[] {
  return boundHost().packs.commands();
}
