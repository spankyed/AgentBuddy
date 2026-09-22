import { splitRef, type FeatureRef } from '../ids/refs.ts';
import { boundFeHost } from '../runtime/fe-host.ts';
import type { AnyActorRef } from 'xstate';
import { getDesignated, hasDesignation } from '../designations/index.ts';

/** An event for a plugin's actor */
export type PluginEvent = { type: string; [key: string]: unknown };

function getApp(): AnyActorRef {
  return boundFeHost().application;
}

/**
 * Opens the plugin at `ref` and hands it `event`, once its actor is running. Pack code names the plugin
 * instead, through the `navigateToPlugin` its `#generated/fe` builds over this (`check:specifiers` keeps it
 * that way); this is for the host, and for that generated code.
 */
export function openRef(ref: FeatureRef, event?: PluginEvent | PluginEvent[]): void {
  const app = getApp();
  const snapshot = app.getSnapshot();
  const registered: Array<{ id: string }> = snapshot.context.plugins ?? [];
  if (!registered.some((plugin) => plugin.id === ref)) {
    throw new Error(`No plugin is registered at "${ref}"`);
  }
  if (snapshot.context.activePlugin.id !== ref) {
    app.send({ type: 'SELECT_PLUGIN', plugin: ref });
  }
  if (snapshot.context.defaultToggles.canvas) {
    app.send({ type: 'DEFAULT_TOGGLE', area: 'canvas' });
  }
  if (event) {
    const events = Array.isArray(event) ? event : [event];
    const actor = app.system.get(ref);
    if (actor) {
      for (const e of events) actor.send(e);
    } else {
      // Until the plugin's actor spawns (a pack's frontend still loading), or the plugin is gone (its pack disabled
      // meanwhile), when the events have nowhere to go
      const sub = app.subscribe((next) => {
        const spawned = app.system.get(ref);
        const stillRegistered = (next.context.plugins ?? []).some((plugin: { id: string }) => plugin.id === ref);
        if (spawned || !stillRegistered) sub.unsubscribe();
        if (spawned) for (const e of events) spawned.send(e);
      });
    }
  }
}

/**
 * Opens the plugin a ref names and hands it `event`, for a ref that arrives as data (a link's target, a registered
 * plugin's `id`) rather than one the pack's code writes, which its generated `navigateToPlugin` checks at compile
 * time. Throws for anything but a registered plugin's `<packId>/<featureId>`.
 */
export function openPlugin(ref: string, event?: PluginEvent | PluginEvent[]): void {
  if (!splitRef(ref)) throw new Error(`"${ref}" doesn't name a plugin: a plugin is named "<packId>/<featureId>"`);
  openRef(ref as FeatureRef, event);
}

/**
 * Opens a link the way the user chose. The plugin playing the `browser` role takes `LINK.OPEN { url }` and decides,
 * by its own settings (a tab of its own, or the system's browser); with no plugin in that role, the system's browser.
 */
export function openLink(url: string): void {
  const browser = hasDesignation('browser') ? getApp().system.get(getDesignated('browser')) : undefined;
  if (browser) browser.send({ type: 'LINK.OPEN', url });
  else window.electronAPI?.shell?.openExternal(url);
}
