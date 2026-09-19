// Package boundaries: host holds app runtime, never transport, and the modules the CLI and the pack test
// harness import stay clear of the pack runtime the app runs.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { HostRuntime } from '@abuddy/sdk/runtime';
import { createEarsEngine } from '@abuddy/ears';
import type { LmdbStore } from '@abuddy/ears/lmdb';
import { testRootEvents } from '@abuddy/sdk/testing';
import { createHostRuntime } from '../src/services/index.ts';
import { createPackRegistry } from '../src/packs/pack-registration.ts';

const HOST_ROOT = path.resolve(__dirname, '..');
const SRC = path.join(HOST_ROOT, 'src');
const RUNTIME = path.join(SRC, 'packs', 'runtime');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|mts|cts|js|mjs|cjs)$/.test(entry.name) ? [full] : [];
  });
}

interface Import {
  specifier: string;
  /** `import type` / `export type`: erased, so it loads nothing */
  typeOnly: boolean;
}

function importsOf(file: string): Import[] {
  const source = fs.readFileSync(file, 'utf8');
  const found: Import[] = [];
  for (const match of source.matchAll(/^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) {
    found.push({ specifier: match[2], typeOnly: Boolean(match[1]) });
  }
  for (const match of source.matchAll(/\b(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    found.push({ specifier: match[1], typeOnly: false });
  }
  return found;
}

/** The host source files `entry` loads at runtime, itself included */
function runtimeClosure(entry: string): Set<string> {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const { specifier, typeOnly } of importsOf(file)) {
      if (typeOnly || !specifier.startsWith('.')) continue;
      const target = path.resolve(path.dirname(file), specifier);
      if (!fs.existsSync(target)) throw new Error(`${path.relative(HOST_ROOT, file)} imports ${specifier}, which doesn't exist`);
      visit(target);
    }
  };
  visit(entry);
  return seen;
}

/** The services the app implements, each in `src/services/<kebab-case key>.ts`; the type checks the list is complete */
const HOST_SERVICE_KEYS = ['appData', 'traceStore', 'inference', 'secrets', 'filesystem'] as const satisfies readonly (keyof HostRuntime['services'])[];
type MissingServiceKey = Exclude<keyof HostRuntime['services'], (typeof HOST_SERVICE_KEYS)[number]>;
const serviceKeysComplete: [MissingServiceKey] extends [never] ? true : MissingServiceKey = true;
const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const inRuntime = (file: string) => file.startsWith(RUNTIME + path.sep);
/** The bus reads the loaded packs (clientLoadedPacks); that module loads nothing else of the runtime */
const LOADED_PACKS = path.join(RUNTIME, 'loaded-packs.ts');

const rel = (file: string) => path.relative(HOST_ROOT, file);

describe('host package boundaries', () => {
  it('imports no transport: fastify, @trpc/*, ws or virtual:* modules', () => {
    const transport = /^(fastify(\/|$)|@fastify\/|@trpc\/|ws$|ws\/|virtual:)/;
    const offending = sourceFiles(SRC).flatMap((file) =>
      importsOf(file).filter(({ specifier }) => transport.test(specifier)).map(({ specifier }) => `${rel(file)}: ${specifier}`));
    expect(offending, 'Transport belongs in packages/api; host is also run by the CLI and the pack test harness').toEqual([]);
  });

  it('imports itself by relative path, never as @abuddy/host/*', () => {
    const offending = sourceFiles(SRC).flatMap((file) =>
      importsOf(file).filter(({ specifier }) => /^@abuddy\/host(\/|$)/.test(specifier)).map(({ specifier }) => `${rel(file)}: ${specifier}`));
    expect(offending).toEqual([]);
  });

  it('keeps the @abuddy/host/packs barrel clear of the pack runtime', () => {
    const reached = [...runtimeClosure(path.join(SRC, 'packs', 'index.ts'))].filter(inRuntime).map(rel);
    expect(reached, 'The CLI imports @abuddy/host/packs: importing packs/runtime from it bundles the loader into @abuddy/cli').toEqual([]);
  });

  it('keeps the bus clear of the pack runtime, apart from the loaded packs', () => {
    const busFiles = sourceFiles(path.join(SRC, 'bus'));
    const reached = new Set(busFiles.flatMap((file) => [...runtimeClosure(file)]).filter(inRuntime));
    reached.delete(LOADED_PACKS);
    expect([...reached].map(rel), 'The pack test harness imports @abuddy/host/bus: it must not load the pack loader').toEqual([]);
  });

  it("holds only the app-implemented services in src/services, one file each, and the runtime's index", () => {
    expect(serviceKeysComplete).toBe(true);
    const files = fs.readdirSync(path.join(SRC, 'services')).sort();
    expect(files, 'src/services holds HostRuntime["services"]: put other host code in a module named by its concern')
      .toEqual([...HOST_SERVICE_KEYS.map((key) => `${kebab(key)}.ts`), 'index.ts'].sort());
    // The services the runtime assembles are exactly these (the store is reached only when a service is called)
    const runtime = createHostRuntime({ store: {} as LmdbStore, engine: createEarsEngine({ isEntityType: () => false }), transport: { rootEvents: testRootEvents }, appVersion: '0.0.0', packs: createPackRegistry() });
    expect(Object.keys(runtime.services).sort()).toEqual([...HOST_SERVICE_KEYS].sort());
  });
});
