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
import { boundHost, _isHostBound } from '../runtime/host-runtime.ts';
import { boundFeHost, _isFeHostBound } from '../runtime/fe-host.ts';

export { COMMANDS_ROLE } from './role.ts';

/** A slash command: the name typed after the `/`, and what the chat shows after it */
export interface PackCommand {
  name: string;
  placeholder: string;
}

/**
 * What the designated owner serves, or none when no pack plays the role — an app with no command
 * owner has no commands, which is a shorter answer than an error and the one every caller wants.
 *
 * **A bound frontend wins**, as it does for sends and for the registered packs' lookups
 * (`_boundPackExtensions`). The owner's rows live on the backend, so a window cannot resolve the
 * designation itself: it reads the list the app published, which the shell holds (`HostShellState.commands`).
 * One name for both hosts, so a caller says what it wants rather than where it runs.
 *
 * It is a plain read, not a reactive one. A component or composable that must re-render when the list
 * changes reads `useShell().commands` (`@apackdev/sdk/fe`) instead; this is for code with no scope to
 * follow it in, such as a ProseMirror plugin reading the list as a transaction arrives.
 *
 * **Not for the app code that publishes the list.** Whoever fills the shell reads the registry it holds
 * (`registry.commands()`), because this would hand it back the shell's copy of what it is about to send —
 * in the app a different process's, and in a pack's tests, where both hosts are bound, its own.
 */
export function getCommands(): PackCommand[] {
  if (_isFeHostBound()) return [...boundFeHost().application.getSnapshot().context.commands];
  if (_isHostBound()) return boundHost().packs.commands();
  throw new Error('No host is bound to read the commands from: call bindHost(runtime) (backend) or bindFeHost(runtime) (frontend) from @apackdev/sdk/runtime first');
}
