// Registries are instances: two in one process hold their own packs, and the SDK's lookups read the bound one.
// "Their own packs" covers which packs are loaded, not only what those packs contributed: the loaded list used
// to sit at module scope beside the registry, where a second registry in the process saw the first's.
import { describe, expect, it } from 'vitest';
import { startTestRuntime } from '@abuddy/sdk/testing';
import { services } from '@abuddy/sdk/services';
import { getDesignated, hasDesignation } from '@abuddy/sdk/designations';
import { stepRegistry, type StepDefinition } from '@abuddy/sdk/steps';
import { getPackSettingsDefaults, type PackRegistration } from '@abuddy/sdk/framework';
import { createPackRegistry } from '../../src/packs/pack-registration.ts';

const pack = (id: string, role: string, step: string, service: string, plugin: string): PackRegistration => ({
  id,
  systems: [{ id: `${id}.${role}`, machine: {} as never, events: new Set(), designation: role }],
  steps: [{ type: step, kind: 'step' } as StepDefinition],
  services: { [service]: { from: id } },
  features: [{ id: plugin, hasSystem: false, hasPlugin: true, services: [], settings: { plugins: { [plugin]: { from: id } } } }],
});

describe('two registries in one process', () => {
  const bound = createPackRegistry();
  const other = createPackRegistry();
  startTestRuntime({ packs: bound });
  bound.registerPack(pack('memo-pack', 'memos', 'memo_step', 'memoService', 'memos'));
  other.registerPack(pack('card-pack', 'cards', 'card_step', 'cardService', 'cards'));

  it("keep their own packs' designations, steps, services and settings defaults", () => {
    expect(bound.designation('memos')).toBe('memo-pack.memos');
    expect(bound.designation('cards')).toBeUndefined();
    expect(other.designation('cards')).toBe('card-pack.cards');
    expect(other.designation('memos')).toBeUndefined();

    expect(bound.steps().map((s) => s.type)).toEqual(['memo_step']);
    expect(other.steps().map((s) => s.type)).toEqual(['card_step']);

    expect(Object.keys(bound.getRegisteredServices())).toEqual(['memoService']);
    expect(Object.keys(other.getRegisteredServices())).toEqual(['cardService']);

    expect(bound.settingsDefaults().settings).toEqual({ plugins: { memos: { from: 'memo-pack' } } });
    expect(other.settingsDefaults().settings).toEqual({ plugins: { cards: { from: 'card-pack' } } });
  });

  it('let the SDK read only the bound one', () => {
    expect(getDesignated('memos')).toBe('memo-pack.memos');
    expect(hasDesignation('cards')).toBe(false);
    expect(stepRegistry.has('memo_step')).toBe(true);
    expect(stepRegistry.has('card_step')).toBe(false);
    expect(services.memoService).toEqual({ from: 'memo-pack' });
    expect(services.cardService).toBeUndefined();
    expect(getPackSettingsDefaults().settings).toEqual({ plugins: { memos: { from: 'memo-pack' } } });
  });

  it("hold their own loaded packs, not one list between them", () => {
    const origin = { id: 'memo-pack', name: 'Memo', version: '1.0.0', dir: '/packs/memo-pack', builtIn: false };
    bound.registerPack(pack('origin-pack', 'origins', 'origin_step', 'originService', 'origins'), { ...origin, id: 'origin-pack' });

    expect(bound.externalPacks().map((o) => o.id)).toContain('origin-pack');
    expect(other.externalPacks()).toEqual([]);
    expect(other.packOrigin('origin-pack')).toBeNull();

    bound.unregisterPack('origin-pack');
  });

  it("don't see each other's registrations, so the same pack registers in both", () => {
    other.registerPack(pack('memo-pack', 'memos', 'memo_step', 'memoService', 'memos'));
    expect(other.designation('memos')).toBe('memo-pack.memos');
    other.unregisterPack('memo-pack');
    expect(bound.designation('memos')).toBe('memo-pack.memos');
    expect(stepRegistry.has('memo_step')).toBe(true);
  });
});
