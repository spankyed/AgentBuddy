// The code system's contract: what it receives, what its own children send it, what it sends its plugin,
// and its context. Its own module, not the feature's types barrel: `#generated/types` star-exports that,
// and one `Contract` per feature would collide there. Codegen reads this without running anything.
import type { IncomingExplorerEvents, OutgoingExplorerEvents } from './features/explorer';
import type { IncomingSearchEvents, OutgoingSearchEvents } from './features/search';
import type { IncomingCommitEvents, OutgoingCommitEvents } from './features/commit';
import type { IncomingPullRequestEvents, OutgoingPullRequestEvents } from './features/pull-request';
import type { IncomingTerminalEvents, OutgoingTerminalEvents } from './features/terminal';
import type { IncomingActionsEvents, OutgoingActionsEvents } from './features/actions';
import type { IncomingPromptsEvents, OutgoingPromptsEvents } from './features/prompts';
import type { CodeConnectedData, Context } from './types';

export type IncomingCodeEvents =
  | IncomingExplorerEvents
  | IncomingSearchEvents
  | IncomingCommitEvents
  | IncomingPullRequestEvents
  | IncomingTerminalEvents
  | IncomingActionsEvents
  | IncomingPromptsEvents
  | { type: 'SET_BASE_DIRECTORY'; path: string; fromUserNavigation?: boolean }
  /** Settings → Providers: resolve a CLI and store where it was found, in this feature's own settings */
  | { type: 'TEST_CLI_PROVIDER'; provider: string }
export type OutgoingCodeEvents =
  | OutgoingExplorerEvents
  | OutgoingSearchEvents
  | OutgoingCommitEvents
  | OutgoingPullRequestEvents
  | OutgoingTerminalEvents
  | OutgoingActionsEvents
  | OutgoingPromptsEvents
  // Broadcast events (sent to all child systems)
  | { type: 'CODE_CONNECTED'; data: CodeConnectedData }
  /** What testing a CLI found, for the Settings view that asked (the host declares its plugin takes it) */
  | { type: 'CLI_TEST_RESULT'; provider: string; success: boolean; error?: string; resolvedPath?: string }

export type Contract = {
  context: Context
  incoming: IncomingCodeEvents
  outgoing: OutgoingCodeEvents
}
