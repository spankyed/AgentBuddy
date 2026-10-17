import { createNativePackTestRegistry } from '@apackdev/host/testing';
// Registries are instances: two in one process hold their own packs, and the SDK's lookups read the bound one.
// "Their own packs" covers which packs are loaded, not only what those packs contributed: the loaded list used
// to sit at module scope beside the registry, where a second registry in the process saw the first's.
import { describe, expect, it } from 'vitest';
import { startTestRuntime } from '@apackdev/sdk/testing';
import { _createPackServices } from '@apackdev/sdk/services';
import { getDesignated, hasDesignation } from '@apackdev/sdk/designations';
import { stepRegistry } from '@apackdev/sdk/steps';
import { getSettingsCatalog, type PackRegistration } from '@apackdev/sdk/framework';

/** A pack whose feature `featureId` plays `role`, with a system and a plugin with settings */
const pack = (id: string, role: string, step: string, service: string, featureId: string): PackRegistration => ({
  id,
  steps: [{ type: step, kind: 'step', node: { label: step } }],
  services: { [service]: { from: id } },
  features: {
    [featureId]: {
      designation: role,
      system: { machine: {} as never, receives: [] },
      plugin: { receives: [] },
      settings: { defaults: { from: id }, schema: { type: 'object' } },
    },
  },
});

describe('two registries in one process', () => {
  const bound = createNativePackTestRegistry({ settingsForPack: () => ({ get: <T>() => ({} as T), set() {}, reset() {}, onChange: () => () => {} }) });
  const other = createNativePackTestRegistry({ settingsForPack: () => ({ get: <T>() => ({} as T), set() {}, reset() {}, onChange: () => () => {} }) });
  startTestRuntime({ packs: bound });
  const generated = _createPackServices();
  bound.registerPack({ ...pack('memo-pack', 'memos', 'memo_step', 'memoService', 'memos'), bindServices: generated.bindServices });
  other.registerPack(pack('card-pack', 'cards', 'card_step', 'cardService', 'cards'));

  it("keep their own packs' designations, steps, services and settings defaults", () => {
    expect(bound.designation('memos')).toBe('memo-pack/memos');
    expect(bound.designation('cards')).toBeUndefined();
    expect(other.designation('cards')).toBe('card-pack/cards');
    expect(other.designation('memos')).toBeUndefined();

    expect(bound.steps().map((s) => s.type)).toEqual(['memo_step']);
    expect(other.steps().map((s) => s.type)).toEqual(['card_step']);

    expect(Object.keys(bound.getRegisteredServices())).toEqual(['memoService']);
    expect(Object.keys(other.getRegisteredServices())).toEqual(['cardService']);

    expect(bound.settingsCatalog().features).toEqual({ 'memo-pack/memos': { defaults: { from: 'memo-pack' }, schema: { type: 'object' } } });
    expect(other.settingsCatalog().features).toEqual({ 'card-pack/cards': { defaults: { from: 'card-pack' }, schema: { type: 'object' } } });
  });

  it('let the SDK read only the bound one', () => {
    expect(getDesignated('memos')).toBe('memo-pack/memos');
    expect(hasDesignation('cards')).toBe(false);
    expect(stepRegistry.has('memo_step')).toBe(true);
    expect(stepRegistry.has('card_step')).toBe(false);
    expect(generated.services.memoService).toEqual({ from: 'memo-pack' });
    expect(generated.services.cardService).toBeUndefined();
    expect(getSettingsCatalog().features).toEqual(bound.settingsCatalog().features);
  });

  it("hold their own loaded packs, not one list between them", () => {
    const origin = { declarationRevision: 'fixture-revision', id: 'memo-pack', name: 'Memo', version: '1.0.0', dir: '/packs/memo-pack' };
    bound.registerPack({ id: 'origin-pack' }, { ...origin, id: 'origin-pack' });

    expect(bound.loadedPacks().map((o) => o.id)).toContain('origin-pack');
    expect(other.loadedPacks()).toEqual([]);
    expect(other.packOrigin('origin-pack')).toBeNull();

    bound.unregisterPack('origin-pack');
  });

  it("don't see each other's registrations, so the same pack registers in both", () => {
    other.registerPack(pack('memo-pack', 'memos', 'memo_step', 'memoService', 'memos'));
    expect(other.designation('memos')).toBe('memo-pack/memos');
    other.unregisterPack('memo-pack');
    expect(bound.designation('memos')).toBe('memo-pack/memos');
    expect(stepRegistry.has('memo_step')).toBe(true);
  });
});
