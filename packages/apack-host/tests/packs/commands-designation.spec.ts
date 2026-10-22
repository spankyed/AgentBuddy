import { expect, it } from 'vitest';
import { createPackRegistry } from '../../src/packs/registry.ts';

/**
 * Commands are served by whichever feature plays the `commands` designation, not unioned across packs.
 *
 * That is the whole reason it is a role: exactly one feature owns where editable commands live, so the
 * registry refuses a second claimant rather than merging two lists and picking a precedence rule. The
 * commands themselves are content, which is why the registration carries a provider and not an array —
 * the rows change as the user edits them, with nothing for the registry to cache.
 *
 * The provider is the **feature's**, where the manifest declares it, and the role resolves to that
 * feature's ref: so there is nothing to reconcile between the two declarations, and one on any other
 * feature is simply never reached.
 */
const declare = (id: string, role = 'commands') => ({ id,
  features: { library: { description: 'Command owner fixture.', designation: role } } });
const owner = (id: string, getCommands: () => { name: string; placeholder: string }[]) => ({
  id,
  features: { library: { designation: 'commands', getCommands } },
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

/**
 * A provider on a feature that doesn't play the role is never asked, because the role is what the
 * resolution starts from. The manifest refuses that declaration outright
 * (`apack-sdk/tests/build/manifest-schema.spec.ts`), so this is the behaviour behind that refusal
 * rather than a second line of defence: there is no precedence to get wrong and nothing to reconcile.
 */
it('asks only the feature playing the role', () => {
  const registry = createPackRegistry({ nativeDeclarations: [{ id: 'presumptuous',
    features: { library: { description: 'Owner.', designation: 'commands' }, notes: { description: 'Not the owner.' } } }] });

  registry.registerPack({ id: 'presumptuous', features: {
    library: { designation: 'commands', getCommands: () => [{ name: 'owned', placeholder: 'By the role' }] },
    notes: { getCommands: () => [{ name: 'stray', placeholder: 'Never asked' }] },
  } });

  expect(registry.commands().map(command => command.name)).toEqual(['owned']);
});

/** The reader owns what it is handed: a caller mutating a row cannot reach the provider's. */
it('hands back rows a caller cannot write through', () => {
  const rows = [{ name: 'pr2md', placeholder: 'PR number' }];
  const registry = registryWith(declare('default-setup'));
  registry.registerPack(owner('default-setup', () => rows));

  registry.commands()[0]!.placeholder = 'Reader mutation';

  expect(registry.commands()[0]!.placeholder).toBe('PR number');
});
