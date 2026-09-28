import type { PluginInbox } from '@abuddy/sdk/fe';

// This plugin's contract: the state it publishes, and what another plugin may send it. A leaf — it imports no
// machine, no other feature and nothing from #generated/* but `types` and `ears`, which is what lets codegen read
// the contract without resolving the machine, whose own imports cycle back through #generated/events.
// abuddy.json names it at features[].plugin.contract.

export interface __PASCAL__Context {
  ready: boolean;
}

/**
 * What another feature may send this plugin, by audience: `pack` is your own pack's features, `public` is what a
 * pack depending on yours may send. Its own feature's system needs no declaration — codegen reads that system's
 * outgoing events. Delete `inbox` for a plugin nothing else sends to.
 */
export type __PASCAL__Inbox = { type: 'SOMETHING'; id: string };

export type Contract = {
  state: __PASCAL__Context;
  inbox: PluginInbox<{ pack: __PASCAL__Inbox }>;
};
