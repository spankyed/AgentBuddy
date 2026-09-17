// The test runtime's stand-in for the registered packs: what a test puts in testPacks is found first, then what the
// registry the runtime was started with holds
import { afterEach, describe, expect, it } from 'vitest';
import { testPacks, testPacksView } from '../../src/testing/packs.ts';
import type { PackRegistryView } from '../../src/runtime/packs-view.ts';
import type { StepDefinition } from '../../src/steps/types.ts';

const step = (type: string, label: string) => ({ type, fe: { nodeConfig: { label } } }) as unknown as StepDefinition;
const registeredNote = step('note', 'Registered');
const registered: PackRegistryView = {
  ...testPacksView(),
  designation: (role) => (role === 'brain' ? 'brain-system' : undefined),
  step: (type) => (type === 'note' ? registeredNote : undefined),
  steps: () => [registeredNote],
  getRegisteredServices: () => ({ memos: 'registered' }),
  seeders: (packId) => (packId === 'memo-pack' ? [{ key: 'memos', seed: () => ({ created: 0, updated: 0, skipped: 0 }) }] : []),
  commands: () => [{ name: 'standup', placeholder: 'Topic' }],
};
afterEach(() => testPacks.clear());

describe('testPacksView', () => {
  it("finds the registry's contributions when the test put none", () => {
    const view = testPacksView(registered);
    expect(view.designation('brain')).toBe('brain-system');
    expect(view.steps()).toEqual([registeredNote]);
    expect(view.getRegisteredServices()).toEqual({ memos: 'registered' });
    expect(view.seeders('memo-pack').map((s) => s.key)).toEqual(['memos']);
  });

  it('finds what the test put first, and the rest of the registry after it', () => {
    const ownNote = step('note', 'Own');
    const ownTick = step('tick', 'Tick');
    testPacks.steps.set('note', ownNote);
    testPacks.steps.set('tick', ownTick);
    testPacks.designations.set('brain', 'test-brain');
    testPacks.services.set('memos', 'mocked');
    testPacks.seeders.set('memo-pack', []);
    testPacks.commands.set('test-pack', [{ name: 'digest', placeholder: 'Week' }]);

    const view = testPacksView(registered);
    expect(view.step('note')).toEqual(ownNote);
    expect(view.steps()).toEqual([ownNote, ownTick]);
    expect(view.designation('brain')).toBe('test-brain');
    expect(view.getRegisteredServices()).toEqual({ memos: 'mocked' });
    expect(view.seeders('memo-pack')).toEqual([]);
    expect(view.commands().map((c) => c.name)).toEqual(['standup', 'digest']);

    testPacks.clear();
    expect(view.step('note')).toBe(registeredNote);
  });

  it('merges a step the test defines with the registered one of its type, facet by facet, as the registry does', () => {
    const runtime = { execute: () => ({}) };
    const build = { relation: { field: 'noteId' } };
    const view = testPacksView({ ...registered, step: () => ({ ...registeredNote, runtime }) as unknown as StepDefinition, steps: () => [{ ...registeredNote, runtime } as unknown as StepDefinition] });
    testPacks.steps.set('note', { type: 'note', build } as unknown as StepDefinition);

    const merged = { type: 'note', fe: registeredNote.fe, runtime, build };
    expect(view.step('note')).toEqual(merged);
    expect(view.steps()).toEqual([merged]);
  });

  it('is empty without a registry', () => {
    const view = testPacksView();
    expect(view.steps()).toEqual([]);
    expect(view.designation('brain')).toBeUndefined();
    expect(view.settingsDefaults()).toEqual({ revision: 0, settings: { plugins: {} } });
    expect(view.onSettingsDefaultsChanged(() => {})).toBeTypeOf('function');
  });
});
