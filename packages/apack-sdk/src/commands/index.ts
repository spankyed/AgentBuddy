/**
 * The chat's slash commands.
 *
 * **One door: a command is content.** A pack ships commands the way it ships actions, prompts and
 * flows — a content source, compiled and applied, three-way merged, and editable afterwards. The
 * manifest names where the content is, not what the commands are.
 *
 * **One owner: whichever feature plays the `commands` designation.** A role rather than a registry,
 * because exactly one feature can own where editable commands live; a second claimant is refused when
 * its pack registers. That is what lets an editor ask for the list without naming the pack that has
 * it, and why this reads a designation rather than unioning every pack's contributions.
 */
import { boundHost } from '../runtime/host-runtime.ts';

/** The role a feature plays to own and serve the commands */
export const COMMANDS_ROLE = 'commands';

/** A slash command: the name typed after the `/`, and what the chat shows after it */
export interface PackCommand {
  name: string;
  placeholder: string;
}

/**
 * What the designated owner serves, or none when no pack plays the role — an app with no command
 * owner has no commands, which is a shorter answer than an error and the one every caller wants.
 */
export function getCommands(): PackCommand[] {
  return boundHost().packs.commands();
}
