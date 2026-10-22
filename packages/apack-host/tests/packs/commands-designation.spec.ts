import { expect, it } from 'vitest';
import { createPackRegistry } from '../../src/packs/registry.ts';

/**
 * Commands are served by whichever feature plays the `commands` designation, not unioned across packs.
 *
 * That is the whole reason it is a role: exactly one feature owns where editable commands live, so the
 * registry refuses a second claimant rather than merging two lists and picking a precedence rule. The
 * commands themselves are content, which is why the registration carries a provider and not an array —
 * the rows change as the user edits them, with nothing for the registry to cache.
 */
const declare = (id: string, role = 'commands') => ({ id,
  features: { library: { description: 'Command owner fixture.', designation: role } } });
const owner = (id: string, commands: () => { name: string; placeholder: string }[]) => ({
  id,
  features: { library: { designation: 'commands' } },
  commandProvider: commands,
});
const registryWith = (...declarations: ReturnType<typeof declare>[]) =>
  createPackRegistry({ nativeDeclarations: declarations });

it('serves what the designated feature provides, on every read', () => {
  const registry = registryWith(declare('default-setup'));
  let rows = [{ name: 'pr2md', placeholder: 'PR number' }];
  registry.registerPack(owner('default-setup', () => rows));

  expect(registry.commands()).toEqual([{ name: 'pr2md', placeholder: 'PR number' }]);

  // content the user edited between reads: no cache to invalidate
  rows = [{ name: 'pr2md', placeholder: 'PR number' }, { name: 'standup', placeholder: 'Topic' }];
  expect(registry.commands().map(command => command.name)).toEqual(['pr2md', 'standup']);
});

it('has none when no pack plays the role', () => {
  const registry = createPackRegistry({ nativeDeclarations: [{ id: 'quiet', features: {} }] });
  registry.registerPack({ id: 'quiet' });
  expect(registry.commands()).toEqual([]);
});

it('stops serving them when the owner unregisters', () => {
  const registry = registryWith(declare('default-setup'));
  registry.registerPack(owner('default-setup', () => [{ name: 'pr2md', placeholder: 'PR number' }]));
  registry.unregisterPack('default-setup');
  expect(registry.commands()).toEqual([]);
});

/** The property the role was chosen for, and the reason this is not a registry every pack adds to. */
it('refuses a second pack claiming the role', () => {
  const registry = registryWith(declare('default-setup'), declare('other'));
  registry.registerPack(owner('default-setup', () => []));
  expect(() => registry.registerPack(owner('other', () => []))).toThrow('Designation collision');
});

/** A provider from a pack with no standing is a manifest error, and says which half to fix. */
it('refuses a provider from a pack that does not play the role', () => {
  const registry = createPackRegistry({ nativeDeclarations: [{ id: 'presumptuous', features: {} }] });
  expect(() => registry.registerPack({ id: 'presumptuous', commandProvider: () => [] }))
    .toThrow('without the "commands" designation');
});

/** The reader owns what it is handed: a caller mutating a row cannot reach the provider's. */
it('hands back rows a caller cannot write through', () => {
  const rows = [{ name: 'pr2md', placeholder: 'PR number' }];
  const registry = registryWith(declare('default-setup'));
  registry.registerPack(owner('default-setup', () => rows));

  registry.commands()[0]!.placeholder = 'Reader mutation';

  expect(registry.commands()[0]!.placeholder).toBe('PR number');
});
