import { applicationState } from '@/main';
import { navigateToPlugin } from './navigate';

export function openInAppBrowser(url: string) {
  const settings = applicationState.system.get('settings')?.getSnapshot();
  const openLinksInApp = settings?.context?.settings?.plugins?.browser?.openLinksInApp ?? true;

  if (openLinksInApp) {
    navigateToPlugin('browser', { type: 'TAB.CREATE', url });
  } else {
    window.electronAPI?.shell?.openExternal(url);
  }
}
