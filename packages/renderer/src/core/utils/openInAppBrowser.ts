import { applicationState } from '@/main';
import { navigateToPlugin } from './navigate';
import { getDesignatedPlugin } from '@abuddy/sdk/fe';

export function openInAppBrowser(url: string) {
  const settings = applicationState.system.get(getDesignatedPlugin('settings'))?.getSnapshot();
  const openLinksInApp = settings?.context?.settings?.plugins?.browser?.openLinksInApp ?? true;

  if (openLinksInApp) {
    navigateToPlugin(getDesignatedPlugin('browser'), { type: 'TAB.CREATE', url });
  } else {
    window.electronAPI?.shell?.openExternal(url);
  }
}
