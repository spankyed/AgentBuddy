/**
 * The slash commands registered packs declare (abuddy.json `commands`). The chat lists them beside the
 * commands its library documents give, and sending one fires a `user.command` event the declaring
 * pack's flows handle. The host tells running systems when the list may have changed with the bus's
 * `PACK_CHANGED`, once a pack's activation, reload or teardown is complete.
 */
import { boundHost } from '../runtime/host-runtime.ts';

/** A slash command: the name typed after the `/`, and what the chat shows after it */
export interface PackCommand {
  name: string;
  placeholder: string;
}

/** Every registered pack's declared commands, in the order the packs were first registered */
export function getPackCommands(): PackCommand[] {
  return boundHost().packs.commands();
}
