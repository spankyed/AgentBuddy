// Loads pack runtime code (CommonJS) so its `require('@abuddy/sdk/…')` gets the loader's own module
// instances. Without it, the runtime would load a separate copy of the SDK with empty registries and
// an empty EARS store. The app bridges its bundled SDK; the pack test harness bridges the pack's.
import Module, { createRequire } from 'node:module';

export interface ModuleBridgeOptions {
  /** Specifier → the module the loaded code gets for `require(specifier)` */
  modules: Readonly<Record<string, unknown>>;
  /** Packages resolved from `resolveFrom` rather than from the loaded file (an installed pack has no node_modules) */
  hostPackages?: readonly string[];
  /** A file (path or file URL) that host packages resolve from */
  resolveFrom?: string;
  /**
   * A package that can't be resolved loads as a module that throws when used, naming it. For tests: a
   * dependency's runtime keeps its npm packages external, and a pack's tests needn't install them all.
   */
  stubMissing?: boolean;
  /** Packages only the bridge provides: a module of one that `modules` lacks throws, rather than loading another copy */
  bridgedPackages?: readonly string[];
}

type ModuleInternals = typeof Module & {
  _resolveFilename(request: string, parent: unknown, ...rest: unknown[]): string;
};

const BRIDGE_PREFIX = '__module_bridge__/';
const STUB_PREFIX = '__missing_module__/';

function missingModule(name: string): unknown {
  const fail = (use: string) => {
    throw new Error(`"${name}" isn't installed (${use}). It's a package a dependency's runtime uses; install it, or mock the service that uses it.`);
  };
  return new Proxy(function missing() {}, {
    get: (_target, property) => (property === '__esModule' ? false : fail(`read ${String(property)}`)),
    apply: () => fail('called'),
    construct: () => fail('constructed'),
  });
}

function isBareSpecifier(request: string): boolean {
  return !request.startsWith('.') && !request.startsWith('/') && !request.startsWith('node:') && !Module.builtinModules.includes(request);
}

/**
 * Runs `fn` (typically a `require` of runtime code) with bridged resolution. The bridged modules stay
 * in the require cache, so requires the code makes later, lazily, get them too.
 */
export function withModuleBridge<T>(options: ModuleBridgeOptions, fn: () => T): T {
  const moduleInternals = Module as ModuleInternals;
  const originalResolve = moduleInternals._resolveFilename;
  const hostRequire = createRequire(options.resolveFrom ?? import.meta.url);
  const cache = hostRequire.cache;

  const hostResolutions = new Map<string, string>();
  for (const name of options.hostPackages ?? []) {
    try { hostResolutions.set(name, hostRequire.resolve(name)); } catch { /* not installed for the host either */ }
  }

  const cacheEntry = (id: string, exports: unknown) => ({ id, filename: id, loaded: true, exports, children: [], paths: [] }) as unknown as NodeJS.Module;
  for (const [specifier, exports] of Object.entries(options.modules)) {
    const key = `${BRIDGE_PREFIX}${specifier}`;
    if (cache[key]) continue;
    const entry = cacheEntry(key, exports);
    cache[key] = entry;
    // Lazy initializers resolve the real path after the patch is gone; point it at the bridged module too
    try {
      const realPath = hostRequire.resolve(specifier);
      if (!cache[realPath]) cache[realPath] = entry;
    } catch { /* the bridge key is enough */ }
  }

  moduleInternals._resolveFilename = function resolve(this: unknown, request: string, parent: unknown, ...rest: unknown[]) {
    if (request in options.modules) return `${BRIDGE_PREFIX}${request}`;
    if (options.bridgedPackages?.some(pkg => request === pkg || request.startsWith(`${pkg}/`))) {
      throw new Error(`${request} isn't provided by this AgentBuddy: rebuild the pack with the current @abuddy/cli`);
    }
    const host = hostResolutions.get(request);
    if (host) return host;
    try {
      return originalResolve.call(this, request, parent, ...rest);
    } catch (err) {
      if (!options.stubMissing || !isBareSpecifier(request)) throw err;
      const key = `${STUB_PREFIX}${request}`;
      cache[key] ??= cacheEntry(key, missingModule(request));
      return key;
    }
  };

  try {
    return fn();
  } finally {
    moduleInternals._resolveFilename = originalResolve;
  }
}
