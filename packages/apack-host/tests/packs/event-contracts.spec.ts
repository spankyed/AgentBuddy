import { expect, it, vi } from 'vitest';
import { setup } from 'xstate';
import { PACK_SNAPSHOT_FORMAT, _declarationRevision, type PackManifest } from '@apackdev/sdk/build';
import { createPackRegistry } from '../../src/packs/registry.ts';

const machine = setup({}).createMachine({});
const events = { system: { incoming: ['START'], outgoing: ['DONE'] }, plugin: { receives: ['DONE', 'SHOW'] } };

it('retains admitted endpoints across caller mutation and later validation-map refresh', () => {
  const registry = createPackRegistry({ nativeDeclarations: [{ id: 'native',
    features: { shell: { description: 'Coordinate the shell.' } }, eventContracts: { shell: events },
  }, { id: 'peer' }] });
  const feature = { system: { machine, receives: ['START'] }, plugin: { receives: ['DONE', 'SHOW'] } };
  const registration = { id: 'native', features: { shell: feature } };
  registry.registerPack(registration);
  feature.system.receives.push('PRIVATE');
  feature.plugin.receives.push('INJECTED');
  feature.system.machine = setup({}).createMachine({});
  Reflect.deleteProperty(registration.features, 'shell');
  registry.registerPack({ id: 'peer' });
  expect(registry.getRegisteredPackSystemIds('native')).toEqual(['native/shell']);
  expect(registry.getRegisteredSystems().get('native/shell')).toBe(machine);
  expect(registry.getEventValidationMap().get('native/shell')).toContain('START');
  expect(registry.getEventValidationMap().get('native/shell')).not.toContain('PRIVATE');
  expect(registry.getPluginEventValidationMap().get('native/shell')).toContain('SHOW');
  expect(registry.getPluginEventValidationMap().get('native/shell')).not.toContain('INJECTED');
});

it('discovers a native shell inbox without a UI pane or bound system and retains metadata after unload', () => {
  const registry = createPackRegistry({ nativeDeclarations: [{ id: 'native',
    features: { shell: { description: 'Coordinate the shell.' } }, eventContracts: { shell: events },
  }] });
  const before = registry.catalog.events();
  expect(before).toMatchObject([{ featureRef: 'native/shell', status: 'compiled', declaration: events }]);
  expect(registry.catalog.plugins()).toEqual([]);
  expect(registry.getEventValidationMap().has('native/shell')).toBe(false);
  registry.registerPack({ id: 'native', features: { shell: { plugin: { receives: ['SHOW', 'DONE'] } } } });
  registry.unregisterPack('native');
  expect(registry.catalog.events()).toEqual(before);
});

it.each([['system', ['PRIVATE']], ['plugin', ['SHOW']], ['system', null]] as const)(
  'refuses changed %s event membership before granting runtime authority', (kind, receives) => {
    const registry = createPackRegistry({ nativeDeclarations: [{ id: 'native',
      features: { shell: { description: 'Coordinate the shell.' } }, eventContracts: { shell: events },
    }] });
    const before = registry.catalog.getSnapshot();
    const bindSettings = vi.fn();
    expect(() => registry.registerPack({ id: 'native', bindSettings,
      features: { shell: { [kind]: { machine, receives } } },
    } as never)).toThrow(`features.shell.${kind}.receives`);
    expect(bindSettings).not.toHaveBeenCalled();
    expect(registry.getPackRegistration('native')).toBeNull();
    expect(registry.catalog.getSnapshot()).toBe(before);
  },
);

it('keeps disabled installed endpoint data discoverable without authored source or runtime imports', () => {
  const manifest: PackManifest = { id: 'offline', name: 'Offline', version: '1.0.0', features: {
    jobs: { description: 'Run jobs.', system: { entry: 'missing/system.ts' }, plugin: { label: 'Jobs', state: 'missing/plugin.ts' } },
  } };
  const registry = createPackRegistry();
  registry.catalog.replace([{ dir: '/nonexistent/pack', enabled: false, snapshot: {
    manifest, declarationRevision: _declarationRevision(manifest), format: PACK_SNAPSHOT_FORMAT,
    types: { entities: {}, relKinds: {} }, facades: {}, entityDestinations: {}, eventContracts: { jobs: events },
  } }]);
  expect(registry.catalog.events()).toMatchObject([{ featureRef: 'offline/jobs', enabled: false, status: 'compiled', declaration: events }]);
  expect(registry.loadedPacks()).toEqual([]);
  expect(registry.getPluginEventValidationMap().size).toBe(0);
  registry.catalog.setSources([{ manifest: { ...manifest, id: 'authoring' }, dir: '/source-only',
    declarationRevision: _declarationRevision({ ...manifest, id: 'authoring' }),
  }]);
  expect(registry.catalog.events().find(entry => entry.packId === 'authoring')).toMatchObject({ status: 'unavailable' });
});
