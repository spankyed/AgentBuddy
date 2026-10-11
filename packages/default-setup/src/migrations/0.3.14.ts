import { services } from '#generated/services.ts';
import type { DeclaredMigration } from '@apack/sdk/framework';
import { ref } from '#generated/ref.ts';

export const migration: DeclaredMigration = {
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
