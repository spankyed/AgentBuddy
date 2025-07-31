import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'AgentBuddy',
    executableName: 'agentbuddy',
    icon: './src/assets/icon',
    appBundleId: 'com.agentbuddy.app',
    appCategoryType: 'public.app-category.productivity',
  },
  rebuildConfig: {
    onlyModules: ['node-pty-prebuilt-multiarch']
  },
  makers: [
    new MakerSquirrel({
      name: 'agentbuddy',
      authors: 'Angel Santiago',
      description: 'AI Agent Platform',
    }),
    new MakerZIP({}, ['darwin']),
    new MakerDMG({
      format: 'ULFO',
    }),
    new MakerRpm({
      options: {
        homepage: 'https://agentbuddy.com',
      },
    }),
    new MakerDeb({
      options: {
        maintainer: 'Angel Santiago',
        homepage: 'https://agentbuddy.com',
      },
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;