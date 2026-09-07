import { getHostModule } from '../runtime/host';
import { getDesignated } from '../designations/index';

function getApp(): any {
  return getHostModule('application');
}

export function navigateToPlugin(pluginId: string, event?: Record<string, any> | Record<string, any>[]) {
  const app = getApp();
  const snapshot = app.getSnapshot();
  if (snapshot.context.activePlugin.id !== pluginId) {
    app.send({ type: 'SELECT_PLUGIN', pluginId });
  }
  if (snapshot.context.defaultToggles.canvas) {
    app.send({ type: 'DEFAULT_TOGGLE', area: 'canvas' });
  }
  if (event) {
    const events = Array.isArray(event) ? event : [event];
    for (const e of events) {
      app.system.get(pluginId)?.send(e);
    }
  }
}

export function openInAppBrowser(url: string) {
  const app = getApp();
  const settings = app.system.get(getDesignated('settings'))?.getSnapshot();
  const openLinksInApp = settings?.context?.settings?.plugins?.browser?.openLinksInApp ?? true;

  if (openLinksInApp) {
    navigateToPlugin(getDesignated('browser'), { type: 'TAB.CREATE', url });
  } else {
    (window as any).electronAPI?.shell?.openExternal(url);
  }
}

export function useState<T = any>(pluginId: string): T {
  const actor = getApp().system.get(pluginId) as T;
  if (!actor) {
    throw new Error(`Plugin actor not found: ${pluginId}`);
  }
  return actor;
}
