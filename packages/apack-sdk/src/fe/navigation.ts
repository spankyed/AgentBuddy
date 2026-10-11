import { boundFeHost } from '../runtime/fe-host.ts';
import { getDesignated, hasDesignation } from '../designations/index.ts';
import type { HostShell, PluginEvent } from './shell.ts';
import { splitRef } from '../ids/refs.ts';
import { _runDelivery } from '../events/delivery.ts';

export type { PluginEvent } from './shell.ts';

function getApp(): HostShell {
  return boundFeHost().application;
}

/**
 * Opens the plugin at `ref` and hands its actor `event`, checking nothing about either: the untyped half of the
 * `openPlugin` a pack's `#generated/fe` builds over this, as `untypedQx` is of `qx`. Pack code naming a plugin
 * itself uses the generated one, which checks the name and the event at compile time; this is for a ref that
 * arrives as data — a link block's target — and for host code, which has no pack to be typed against.
 *
 * The shell does the opening, so a ref whose pack's frontend is still loading opens once it has loaded, and one no
 * pack provides is reported to the user once loading has settled. Only a string that isn't a ref at all is refused
 * here.
 */
export function untypedOpenPlugin(ref: string, event?: PluginEvent | PluginEvent[]): void {
  if (!splitRef(ref)) throw new Error(`"${ref}" doesn't name a plugin: a plugin is named "<packId>/<featureId>"`);
  const events = event === undefined ? [] : Array.isArray(event) ? event : [event];
  getApp().send({ type: 'OPEN_PLUGIN', plugin: ref, events });
}

/**
 * Opens a link the way the user chose. The plugin playing the `browser` role takes `LINK.OPEN { url }` and decides,
 * by its own settings (a tab of its own, or the system's browser); with no plugin in that role, the system's browser.
 */
export function openLink(url: string): void {
  const ref = hasDesignation('browser') ? getDesignated('browser') : undefined;
  const browser = ref ? getApp().system.get(ref) : undefined;
  // Reaching the actor rather than asking the shell, because the lookup *is* the decision: a shell request for a
  // plugin that isn't here waits and then tells the user, where this has somewhere better to go. The delivery is
  // opened anyway, so a send the browser makes while handling carries its own ref — the thing every other path to
  // a plugin's actor gets from the host's `notifyPluginActor`, and the one reason this bypass still had to change.
  if (browser && ref) _runDelivery({ receiver: ref }, () => browser.send({ type: 'LINK.OPEN', url }));
  else window.electronAPI?.shell?.openExternal(url);
}
