import { applicationState } from '@/main';
import { navigateToPlugin } from './navigate';
import { settings as settingsId } from '@/registries/plugin-ids';
import { browser } from '@/registries/plugin-ids';

export function openInAppBrowser(url: string) {
  const settings = applicationState.system.get(settingsId)?.getSnapshot();
  const openLinksInApp = settings?.context?.settings?.plugins?.browser?.openLinksInApp ?? true;

  if (openLinksInApp) {
    navigateToPlugin(browser, { type: 'TAB.CREATE', url });
  } else {
    window.electronAPI?.shell?.openExternal(url);
  }
}
