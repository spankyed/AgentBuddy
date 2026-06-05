import { applicationState } from '@/main';

/**
 * Navigate to a plugin's canvas view, activating it if necessary.
 * Use this for all cross-plugin canvas navigation to ensure the active
 * plugin always switches before the target plugin receives its event.
 */
export function navigateToPlugin(pluginId: string, event: Record<string, any>) {
  const snapshot = applicationState.getSnapshot();
  if (snapshot.context.activePlugin.id !== pluginId) {
    applicationState.send({ type: 'SELECT_PLUGIN', pluginId });
  }
  if (snapshot.context.defaultToggles.canvas) {
    applicationState.send({ type: 'DEFAULT_TOGGLE', area: 'canvas' });
  }
  applicationState.system.get(pluginId)?.send(event);
}
