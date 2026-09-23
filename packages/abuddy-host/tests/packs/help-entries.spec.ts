// Help entries are a contribution, like commands and blocks: the app's Settings view lists what every pack
// answers with, so any pack can add help. They are read the first time the list is read, not at registration,
// because a pack's may come from its compiled seeds — which exist only after it is built.
import { describe, expect, it, vi } from 'vitest';
import type { HelpEntry, PackRegistration } from '@abuddy/sdk/framework';
import { createPackRegistry } from '../../src/packs/registry.ts';

const entry = (id: string): HelpEntry => ({ id, question: `q-${id}`, answer: `a-${id}` });
const pack = (id: string, help?: () => HelpEntry[]): PackRegistration => ({ id, help });

describe('the help entries registered packs contribute', () => {
  it('lists every pack\'s, in the order the packs registered', () => {
    const registry = createPackRegistry();
    registry.registerPack(pack('first', () => [entry('a')]));
    registry.registerPack(pack('second', () => [entry('b')]));

    expect(registry.help().map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('reads a pack\'s the first time the list is read, not when it registers', () => {
    const read = vi.fn(() => [entry('late')]);
    const registry = createPackRegistry();

    registry.registerPack(pack('slow', read));
    expect(read).not.toHaveBeenCalled();

    expect(registry.help()).toHaveLength(1);
    expect(read).toHaveBeenCalled();
  });

  // What the ranking is for: a pack that unregisters and registers again (a reload, an update) keeps its place,
  // so the Help list doesn't reorder itself under the user
  it('keeps a reloaded pack where it was', () => {
    const registry = createPackRegistry();
    registry.registerPack(pack('first', () => [entry('a')]));
    registry.registerPack(pack('second', () => [entry('b')]));

    registry.unregisterPack('first');
    registry.registerPack(pack('first', () => [entry('a')]));

    expect(registry.help().map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('drops a pack\'s when it unregisters', () => {
    const registry = createPackRegistry();
    registry.registerPack(pack('going', () => [entry('a')]));
    registry.unregisterPack('going');

    expect(registry.help()).toEqual([]);
  });

  // The list is read from inside the settings system, in the action that sends the Settings view all its data, so a
  // pack that throws here used to cost the app its whole settings view rather than its own help
  it('keeps every other pack\'s when one cannot read its entries, and says which', () => {
    // No app is bound in this spec, so the logger writes to the console
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const registry = createPackRegistry();
    registry.registerPack(pack('first', () => [entry('a')]));
    registry.registerPack(pack('broken', () => { throw new Error('no compiled seeds'); }));
    registry.registerPack(pack('last', () => [entry('b')]));

    expect(registry.help().map((e) => e.id)).toEqual(['a', 'b']);
    expect(logged.mock.calls.flat().join(' ')).toMatch(/Pack "broken" could not read its help entries/);
    logged.mockRestore();
  });

  // Two packs may answer the same question; unlike a command name there is nothing to collide over
  it('keeps both when two packs answer alike', () => {
    const registry = createPackRegistry();
    registry.registerPack(pack('one', () => [entry('same')]));
    registry.registerPack(pack('two', () => [entry('same')]));

    expect(registry.help()).toHaveLength(2);
  });
});
