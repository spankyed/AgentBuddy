import { services } from '@/__generated__/services';
import type { PackMigration } from '@abuddy/sdk/framework';
import { ref } from '@/__generated__/ref';

export const migration: PackMigration = {
  target: '0.3.14',
  description: 'Rename code setting lastDirectoryOpened → baseDirectory; move openLinksInApp to browser plugin',
  up: () => {
    const data = services.settings.getAll();
    const code = (data.plugins as any)?.code ?? {};

    // Copy the old key to the new key if it exists and the new key isn't already set
    if (code.lastDirectoryOpened && !code.baseDirectory) {
      services.settings.setForFeature(ref('code'), ['baseDirectory'], code.lastDirectoryOpened);
    }

    // Move openLinksInApp from general.application to plugins.browser
    const openLinksInApp = (data.general as any)?.application?.openLinksInApp;
    if (openLinksInApp !== undefined && !(data.plugins as any)?.browser?.openLinksInApp) {
      services.settings.setForFeature(ref('browser'), ['openLinksInApp'], openLinksInApp);
    }
  },
};
