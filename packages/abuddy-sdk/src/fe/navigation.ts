import { boundFeHost } from '../runtime/fe-host.ts';
import type { AnyActorRef } from 'xstate';
import { getDesignated, hasDesignation } from '../designations/index.ts';

/** An event for a plugin's actor */
export type PluginEvent = { type: string; [key: string]: unknown };

function getApp(): AnyActorRef {
  return boundFeHost().application;
}

/**
 * Opens the plugin at `ref` and hands it `event`, once its actor is running. Throws unless `ref` is a registered
 * plugin's `<packId>/<featureId>`, so a ref that arrives as data (a link's target, a registered plugin's `id`) is
 * checked here; pack code naming a plugin itself uses the `navigateToPlugin` its `#generated/fe` builds over this,
 * which checks the name at compile time too.
 */
export function openPlugin(ref: string, event?: PluginEvent | PluginEvent[]): void {
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
 * Opens a link the way the user chose. The plugin playing the `browser` role takes `LINK.OPEN { url }` and decides,
 * by its own settings (a tab of its own, or the system's browser); with no plugin in that role, the system's browser.
 */
export function openLink(url: string): void {
  const browser = hasDesignation('browser') ? getApp().system.get(getDesignated('browser')) : undefined;
  if (browser) browser.send({ type: 'LINK.OPEN', url });
  else window.electronAPI?.shell?.openExternal(url);
}
