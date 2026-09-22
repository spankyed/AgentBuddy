// What the app shell offers the rest of the app: the package's `fe` barrel, and the packs feature, which
// implements one of the ports the shell takes. A feature's frontend is otherwise its own (check:specifiers).
export { createShellMachine, type ShellMachine } from './machine.ts';
export { visiblePluginsOf, withHostLast } from './plugins.ts';
export { computeCrumbs } from './trail.ts';
export type { ShellNotify, ShellOptions, ShellPackFrontends, ShellStorage } from './types.ts';
