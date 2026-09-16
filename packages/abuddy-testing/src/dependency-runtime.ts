// Loads a dependency's backend runtime (runtime/index.cjs) into the test process on the pack's own
// @abuddy/sdk, xstate and zod, the way the app loads it on its own (api/src/packs/pack-loader.ts).
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { withModuleBridge } from '@abuddy/host/packs';
import type { PackRegistration } from '@abuddy/sdk/framework';

/** @abuddy/sdk exports a backend runtime can require: not the frontend, metadata or the engine's host hook */
function sdkSubpaths(packDir: string): string[] {
  const manifest = createRequire(path.join(packDir, 'package.json')).resolve('@abuddy/sdk/package.json');
  const exportsMap = (JSON.parse(fs.readFileSync(manifest, 'utf-8')) as { exports: Record<string, unknown> }).exports;
  return Object.keys(exportsMap)
    .filter((key) => !key.includes('*') && !key.endsWith('.json') && key !== './fe' && !key.startsWith('./fe/') && key !== './ears/internals')
    .map((key) => (key === '.' ? '@abuddy/sdk' : `@abuddy/sdk/${key.slice(2)}`));
}

function unavailable(specifier: string, reason: string): unknown {
  const fail = () => {
    throw new Error(`${specifier} couldn't be loaded in this pack's tests (${reason}); a dependency's runtime used it`);
  };
  return new Proxy(function unavailableModule() {}, { get: (_target, property) => (property === '__esModule' ? false : fail()), apply: fail, construct: fail });
}

/** The modules dependency runtimes share with the test process, imported from the pack */
async function sharedModules(packDir: string): Promise<Record<string, unknown>> {
  const modules: Record<string, unknown> = {};
  for (const specifier of [...sdkSubpaths(packDir), 'xstate', 'zod']) {
    try {
      modules[specifier] = await import(/* @vite-ignore */ specifier);
    } catch (err) {
      // An optional peer the pack doesn't install: fine until a runtime uses it
      modules[specifier] = unavailable(specifier, err instanceof Error ? err.message.split('\n')[0] : String(err));
    }
  }
  return modules;
}

let shared: Promise<Record<string, unknown>> | undefined;

export interface DependencyRuntime {
  registration: PackRegistration;
}

/**
 * Requires a dependency's runtime with the pack's shared modules bridged and packages the pack doesn't
 * install stubbed, points it at its compiled seeds, and returns its registration.
 */
export async function loadDependencyRuntime(packDir: string, depId: string, runtimeEntry: string, seedsDir: string | undefined): Promise<DependencyRuntime> {
  shared ??= sharedModules(packDir);
  const modules = await shared;
  const require = createRequire(runtimeEntry);
  const mod = withModuleBridge({ modules, stubMissing: true, resolveFrom: runtimeEntry },() => require(runtimeEntry)) as {
    registration?: PackRegistration;
    setCompiledDir?(dir: string): void;
  };
  if (!mod.registration) throw new Error(`Dependency "${depId}": ${runtimeEntry} exports no registration`);
  if (seedsDir) mod.setCompiledDir?.(seedsDir);
  return { registration: mod.registration };
}
