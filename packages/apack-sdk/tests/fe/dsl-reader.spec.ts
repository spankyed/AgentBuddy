import { afterEach, expect, it } from 'vitest';
import { effectScope, nextTick, watchEffect } from 'vue';
import { startFeTestRuntime, stopFeTestRuntime } from '../../src/testing/fe-runtime.ts';
import { getDslDeclaration, getDslDeclarations, useDslDeclarations } from '../../src/fe/dsl-reader.ts';
import type { DslCatalogEntry } from '../../src/framework/catalog-view.ts';

afterEach(stopFeTestRuntime);

it('selects owned static definitions without consulting activation and follows catalog changes within its scope', async () => {
  const entry: DslCatalogEntry = { type: 'memo', packId: 'author', origin: 'installed', enabled: false,
    declaration: { entry: 'missing/types.ts', targets: ['monaco'], prefix: 'memo:' }, definitions: 'first' };
  let entries: readonly DslCatalogEntry[] = [entry, { ...entry, origin: 'source', definitions: undefined }];
  const listeners = new Set<() => void>();
  startFeTestRuntime({ packs: new Proxy({} as never, { get() { throw new Error('No executable providers'); } }), catalog: {
    status: () => 'disconnected', problem: () => undefined, references: () => [], frontend: () => [], steps: () => [], artifacts: () => [], blocks: () => [],
    events: () => [], dsl: () => entries, subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  } });
  expect(getDslDeclaration('memo')).toBe(entry);
  const scope = effectScope(); const seen: (string | undefined)[] = [];
  scope.run(() => { const declarations = useDslDeclarations(); watchEffect(() => { seen.push(declarations.value[0]?.definitions); }); });
  entries = [{ ...entry, definitions: 'replacement' }]; for (const listener of listeners) listener(); await nextTick();
  expect(seen).toEqual(['first', 'replacement']);
  entries = [entry, { ...entry, packId: 'other' }];
  expect(getDslDeclaration('memo')).toBeUndefined(); expect(getDslDeclarations()).toEqual([]);
  entries = [{ ...entry, origin: 'source', definitions: undefined }];
  expect(getDslDeclaration('memo')?.definitions).toBeUndefined();
  scope.stop(); expect(listeners.size).toBe(0);
  expect(() => useDslDeclarations()).toThrow('active Vue effect scope');
});
