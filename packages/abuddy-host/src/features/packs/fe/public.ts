// What the Packs feature offers the rest of the app: the plugin's machine, the pack-frontend loader the shell is
// given, and the install a deep link asks for. Its modules are otherwise its own (check:specifiers).
export { default as packsMachine, type PacksContext, type PacksState, type PackInfo } from './machine.ts';
export { createPackFrontends, loadPackFEEntry, type PackFrontendIO, type PackFrontendStyles } from './frontends.ts';
export { installFromProtocol, packInstallRequest, requestPackInstall, type PackInstallRequest } from './install-url.ts';
