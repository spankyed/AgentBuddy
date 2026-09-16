/**
 * The slash commands registered packs declare (abuddy.json `commands`). The chat lists them beside the
 * commands its library documents give, and sending one fires a `user.command` event the declaring
 * pack's flows handle. The host tells running systems when the list may have changed with the bus's
 * `PACK_CHANGED`, once a pack's activation, reload or teardown is complete.
 */

/** A slash command: the name typed after the `/`, and what the chat shows after it */
export interface PackCommand {
  name: string;
  placeholder: string;
}

const registered = new Map<string, PackCommand[]>();
/**
 * Each pack's place in the list, from its first registration. Kept when the pack unregisters, so a
 * reload or update re-registers it where it was rather than after every other pack.
 */
const rank = new Map<string, number>();

/** Every registered pack's declared commands, in the order the packs were first registered */
export function getPackCommands(): PackCommand[] {
  return [...registered]
    .sort(([a], [b]) => rank.get(a)! - rank.get(b)!)
    .flatMap(([, commands]) => commands.map((command) => ({ ...command })));
}

/** @internal Host-only: the pack registry registers each pack's declared commands */
export const packCommandsRegistry = {
  /** Throws when another pack already declares one of the commands, so nothing of this pack is registered */
  register(packId: string, commands: readonly PackCommand[]): void {
    for (const [otherId, theirs] of registered) {
      if (otherId === packId) continue;
      for (const { name } of commands) {
        if (theirs.some((command) => command.name === name)) {
          throw new Error(`Command collision: "${name}" — pack "${packId}" vs "${otherId}"`);
        }
      }
    }
    if (commands.length === 0) {
      registered.delete(packId);
      return;
    }
    if (!rank.has(packId)) rank.set(packId, rank.size);
    registered.set(packId, commands.map((command) => ({ ...command })));
  },

  unregister(packId: string): void {
    registered.delete(packId);
  },
};
