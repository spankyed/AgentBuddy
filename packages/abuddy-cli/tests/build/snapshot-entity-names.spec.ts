// A dependent reads only its *direct* dependencies' snapshots when it generates EntityName, so a chain
// A → B → C used to leave C's names unknown in A even though B surfaces them. A snapshot therefore
// records what its pack can surface — its own names and its dependencies' — which keeps resolution one
// level deep and makes the snapshot self-describing.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../helpers/published-packages';

/** A built-in pack writes dist/snapshot.json; an external one writes it into the bundle's types dir */
const snapshotFile = (pack: string): string | undefined =>
  [path.join(REPO_ROOT, pack, 'dist', 'snapshot.json'), path.join(REPO_ROOT, pack, 'dist', 'types', 'snapshot.json')]
    .find((file) => fs.existsSync(file));

const snapshotAt = (pack: string): { types: { entities: Record<string, string>; relKinds: Record<string, string> } } =>
  JSON.parse(fs.readFileSync(snapshotFile(pack)!, 'utf-8'));

describe('a built pack\'s snapshot', () => {
  const built = snapshotFile('packages/default-setup') !== undefined;

  it.skipIf(!built)('records its own entity names', () => {
    const own = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages/default-setup/abuddy.json'), 'utf-8'));
    const snapshot = snapshotAt('packages/default-setup');
    for (const name of Object.keys(own.entities ?? {})) {
      expect(snapshot.types.entities, name).toHaveProperty(name);
    }
  });

  // tests/fixtures/external-pack depends on default-setup, so its snapshot is what a pack depending on
  // *it* would read. Before this, that pack could not name a default-setup entity.
  const fixture = 'tests/fixtures/external-pack';
  const fixtureBuilt = snapshotFile(fixture) !== undefined;

  it.skipIf(!fixtureBuilt || !built)('records its dependencies\' entity names too, so a chain stays one level deep', () => {
    const dependencyNames = Object.keys(snapshotAt('packages/default-setup').types.entities);
    const dependent = snapshotAt(fixture).types.entities;
    expect(dependencyNames.length).toBeGreaterThan(0);
    for (const name of dependencyNames) {
      expect(dependent, `${fixture} surfaces ${name}`).toHaveProperty(name);
    }
  });

  // Plugins travel the same way, for the diagnostic rather than for resolution: a pack depending on
  // the fixture can't send to a default-setup plugin, and this is what lets the build say which pack
  // to depend on instead of reporting the plugin as unknown.
  it.skipIf(!fixtureBuilt || !built)('records its dependencies\' plugins, with the pack owning each', () => {
    const dependency = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages/default-setup/abuddy.json'), 'utf-8'));
    const owned = (dependency.features ?? []).filter((f: { plugin?: unknown }) => f.plugin).map((f: { id: string }) => f.id);
    const recorded = JSON.parse(fs.readFileSync(snapshotFile(fixture)!, 'utf-8')).dependencyPlugins ?? [];
    expect(owned.length).toBeGreaterThan(0);
    for (const id of owned) {
      expect(recorded, `${fixture} records ${id}`).toContainEqual({ id, packId: 'default-setup' });
    }
  });

  it.skipIf(!fixtureBuilt)('keeps its own names when a dependency declares one with the same key', () => {
    const own = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, fixture, 'abuddy.json'), 'utf-8'));
    const entities = snapshotAt(fixture).types.entities;
    for (const [name, value] of Object.entries(own.entities ?? {})) {
      expect(entities[name], name).toBe(value);
    }
  });
});
