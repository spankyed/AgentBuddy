// What `@abuddy/host/fe` offers a frontend: the things a window needs that aren't a feature's — the registered pack
// frontends, the client's contract, a window's migrations, the ports the renderer implements — and, below, each
// host feature's frontend. The features' halves are named here rather than each keeping a `public.ts` of its own:
// this is the package's export surface, which is why naming a feature's frontend from here is not the crossing
// `check:specifiers` refuses. A feature's modules are otherwise its own, exactly as a pack's are.
export type { Plugin } from '@abuddy/sdk/fe';
export { createFePackRegistry, type FePackRegistry } from './pack-store.ts';
export { HOST } from '../refs.ts';
export type { PackFERegistration } from '@abuddy/sdk/fe';
export { describeFailure, type ShellClient, type ShellConnection, type ShellFailure } from './client.ts';
export type { LoadedPackEntry } from '../packs/layout.ts';
export { runFrontendMigrations, type FrontendMigration, type WindowStorage } from './migrations/index.ts';
export type { ShellPackFrontends } from './pack-frontends.ts';

// The app shell (`features/application/fe/`)
export { createShellMachine, type ShellMachine } from '../features/application/fe/machine.ts';
export { visiblePluginsOf, withHostLast } from '../features/application/fe/plugins.ts';
export { computeCrumbs } from '../features/application/fe/trail.ts';
export type { ShellNotify, ShellOptions, ShellStorage } from '../features/application/fe/types.ts';

// The Packs plugin, the pack-frontend loader the shell is given, and the install a deep link asks for
// (`features/packs/fe/`)
export { default as packsMachine, type PacksContext, type PacksState, type PackInfo } from '../features/packs/fe/machine.ts';
export { createPackFrontends, loadPackFEEntry, type PackFrontendIO, type PackFrontendStyles } from '../features/packs/fe/frontends.ts';
export { installFromProtocol, packInstallRequest, requestPackInstall, type PackInstallRequest } from '../features/packs/fe/install-url.ts';

// The Settings view's machine, as the renderer pairs it with the view's components (`features/settings/fe/`)
export { createSettingsMachine, type SettingsContext, type SettingsEvents, type SettingsIO, type SettingsSave, type SettingsState, type SettingsTarget } from '../features/settings/fe/machine.ts';
