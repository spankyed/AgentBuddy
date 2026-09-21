import { splitRef, type FeatureRef } from '../ids/addressing.ts';
import { boundFeHost } from '../runtime/fe-host.ts';
import type { AnyActorRef } from 'xstate';
import { getDesignated } from '../designations/index.ts';

/** An event for a plugin's actor */
export type PluginEvent = { type: string; [key: string]: unknown };

function getApp(): AnyActorRef {
  return boundFeHost().application;
}

/**
 * Opens the plugin at `address` and hands it `event`, once its actor is running. Pack code names the plugin
 * instead, through the `navigateToPlugin` its `#generated/fe` builds over this (`check:specifiers` keeps it
 * that way); this is for the host, and for that generated code.
 */
export function navigateToAddress(address: FeatureRef, event?: PluginEvent | PluginEvent[]): void {
  const app = getApp();
  const snapshot = app.getSnapshot();
  const registered: Array<{ id: string }> = snapshot.context.plugins ?? [];
  if (!registered.some((plugin) => plugin.id === address)) {
    throw new Error(`No plugin is registered at "${address}"`);
  }
  if (snapshot.context.activePlugin.id !== address) {
    app.send({ type: 'SELECT_PLUGIN', pluginId: address });
  }
  if (snapshot.context.defaultToggles.canvas) {
    app.send({ type: 'DEFAULT_TOGGLE', area: 'canvas' });
  }
  if (event) {
    const events = Array.isArray(event) ? event : [event];
    const actor = app.system.get(address);
    if (actor) {
      for (const e of events) actor.send(e);
    } else {
      const sub = app.subscribe(() => {
        const spawned = app.system.get(address);
        if (spawned) {
          sub.unsubscribe();
          for (const e of events) spawned.send(e);
        }
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
  navigateToAddress(ref as FeatureRef, event);
}

export function openInAppBrowser(url: string) {
  const app = getApp();
  const settings = app.system.get(getDesignated('settings'))?.getSnapshot();
  const browser = getDesignated('browser');
  const openLinksInApp = settings?.context?.settings?.plugins?.[browser]?.openLinksInApp ?? true;

  if (openLinksInApp) {
    navigateToAddress(browser, { type: 'TAB.CREATE', url });
  } else {
    window.electronAPI?.shell?.openExternal(url);
  }
}

/**
 * The actor of the plugin at `address`, as the app's actor system holds it: undefined until the plugin's
 * actor is spawned, as `system.get` is. Pack code names the plugin instead, through the `actorOf` its
 * `#generated/fe` builds over this (`check:specifiers` keeps it that way).
 */
export function actorAt<T = AnyActorRef>(address: FeatureRef): T {
  return getApp().system.get(address) as T;
}
