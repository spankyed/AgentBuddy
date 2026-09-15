import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseManifest } from '../../src/build/validate.ts';

describe('parseManifest', () => {
  it('accepts default-setup abuddy.json', () => {
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, '../../../default-setup/abuddy.json'), 'utf-8'),
    );
    const result = parseManifest(raw);
    expect(result.errors).toEqual([]);
  });

  it("rejects declaring the SDK's entities or relation kinds, by name or value", () => {
    const pack = { id: 'test-pack', name: 'Test', version: '0.1.0' };
    for (const entities of [{ Relation: 'Relation' }, { Link: 'Relation' }, { Action: 'Action' }, { Run: 'TNode' }, { Options: 'Settings' }]) {
      expect(parseManifest({ ...pack, entities }).errors).toEqual([expect.stringMatching(/"entities": Relation, Flow, Node, TNode, Action, Prompt, Settings are defined by the SDK/)]);
    }
    for (const relKinds of [{ CONTAINS: 'contains' }, { NEXT: 'transitions_to' }]) {
      expect(parseManifest({ ...pack, relKinds }).errors).toEqual([expect.stringMatching(/"relKinds": CONTAINS, TRANSITIONS_TO, INSTANCE_OF, SPAWNED, TRACKED are defined by the SDK/)]);
    }
    expect(parseManifest({ ...pack, entities: { Memo: 'Memo', Note: 'Note' }, relKinds: { PINNED: 'pinned' } }).errors).toEqual([]);
  });

  it('accepts a minimal valid manifest', () => {
    const result = parseManifest({ id: 'test-pack', name: 'Test', version: '0.1.0' });
    expect(result.errors).toEqual([]);
  });

  it('rejects unknown top-level keys', () => {
    const result = parseManifest({
      id: 'test-pack', name: 'Test', version: '0.1.0',
      bogusField: true,
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('bogusField');
  });

  it('rejects unknown keys in feature system entries', () => {
    const result = parseManifest({
      id: 'test-pack', name: 'Test', version: '0.1.0',
      features: [{
        id: 'main',
        system: { entry: 'src/system.ts', exportName: 'mainEntry' },
      }],
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('exportName');
  });

  it('rejects missing required fields', () => {
    const result = parseManifest({ name: 'Test' });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid id format', () => {
    const result = parseManifest({ id: 'BadCase', name: 'Test', version: '0.1.0' });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('id');
  });
});

describe('seedFormats and boot.seed entries', () => {
  const pack = { id: 'test-pack', name: 'Test', version: '0.1.0', entities: { Memo: 'Memo' }, dependencies: { 'base-pack': '*' } };
  const memos = {
    format: 'markdown-tree', entity: 'Memo', identity: ['title', 'parent'],
    tree: { branch: 'index.md', relKind: 'contains' },
    fields: { title: { from: 'frontmatter.title', default: 'filename', type: 'string' }, body: { from: 'body' } },
    media: 'media',
  };
  const errorsFor = (seed: Record<string, unknown>, seedFormats: Record<string, unknown> = { memos }) =>
    parseManifest({ ...pack, seedFormats, boot: { seed } }).errors;

  it('accepts specialty paths, entries naming own or dependency formats, and seeder entries', () => {
    expect(errorsFor({
      actions: 'src/seeds/actions',
      flows: { path: 'src/seeds/flows' },
      memos: { path: 'src/seeds/memos', format: 'memos' },
      tags: { path: 'src/seeds/tags.json', format: 'tags' },
      docs: { path: 'src/seeds/docs', format: 'docs' },
      notes: { path: 'src/seeds/notes', format: 'base-pack:notes' },
      custom: { seeder: 'src/seeds/custom.ts' },
    }, {
      memos,
      tags: { format: 'json', entity: 'Memo', identity: ['name'] },
      docs: { compiler: 'src/seeds/compilers/docs.ts', entity: ['Memo'] },
    })).toEqual([]);
  });

  it('rejects a path string for a key the SDK does not compile', () => {
    expect(errorsFor({ library: 'src/seeds/library' })).toEqual([expect.stringMatching(/"boot\.seed\.library": Unknown seed key "library"/)]);
  });

  it('rejects an entry that is neither { path, format } nor { seeder }', () => {
    const shape = /Seed "memos" must be \{ "path", "format" \} or \{ "seeder" \}/;
    expect(errorsFor({ memos: { path: 'src/seeds/memos' } })).toEqual([expect.stringMatching(shape)]);
    expect(errorsFor({ memos: { format: 'memos' } })).toEqual([expect.stringMatching(shape)]);
    expect(errorsFor({ memos: { seeder: 's.ts', path: 'p' } })).toEqual([expect.stringMatching(shape)]);
  });

  it('rejects format settings on an entry: they belong to a seedFormats format', () => {
    expect(errorsFor({ memos: { path: 'p', format: 'memos', fields: { title: { from: 'body' } } } })).toEqual([expect.stringMatching(/Unrecognized key.*fields/)]);
    expect(errorsFor({ memos: { path: 'p', format: 'memos', entity: 'Memo' } })).toEqual([expect.stringMatching(/Unrecognized key.*entity/)]);
  });

  it('accepts a settings seed only in a built-in pack: it holds the app\'s defaults', () => {
    expect(errorsFor({ settings: 'src/seeds/default-settings.ts' })).toEqual([expect.stringMatching(/"boot\.seed\.settings": The "settings" seed holds the app's own defaults, so only built-in packs have one/)]);
    expect(parseManifest({ ...pack, builtIn: true, boot: { seed: { settings: 'src/seeds/default-settings.ts' } } }).errors).toEqual([]);
  });

  it('rejects anything but a path on a specialty key', () => {
    expect(errorsFor({ actions: { path: 'src/seeds/actions', format: 'memos' } })).toEqual([expect.stringMatching(/"actions" is compiled by the SDK/)]);
  });

  it("rejects a format name that isn't in seedFormats, or a dependency prefix that isn't a dependency", () => {
    expect(errorsFor({ memos: { path: 'p', format: 'notes' } })).toEqual([expect.stringMatching(/"boot\.seed\.memos\.format": Seed "memos": no format "notes" in seedFormats/)]);
    expect(errorsFor({ memos: { path: 'p', format: 'other-pack:notes' } })).toEqual([expect.stringMatching(/format "other-pack:notes" names "other-pack", which isn't a dependency/)]);
    expect(errorsFor({ memos: { path: 'p', format: 'Not A Name' } })).toEqual([expect.stringMatching(/Must be a seedFormats name, or "<dependency id>:<name>"/)]);
  });

  it('rejects unknown format keys, bad field sources, and format/compiler misuse', () => {
    const seed = { memos: { path: 'p', format: 'memos' } };
    expect(errorsFor(seed, { memos: { format: 'json', entityType: 'Memo' } })).toEqual([expect.stringMatching(/Unrecognized key.*entityType/)]);
    expect(errorsFor(seed, { memos: { format: 'markdown-tree', fields: { title: { from: 'heading' } } } }))
      .toEqual([expect.stringMatching(/"seedFormats\.memos\.fields\.title\.from": Must be "body", "filename", "path" or "frontmatter\.<name>"/)]);
    expect(errorsFor(seed, { memos: { format: 'json', compiler: 'c.ts' } })).toEqual([expect.stringMatching(/needs "format" or "compiler", not both/)]);
    expect(errorsFor(seed, { memos: { entity: 'Memo' } })).toEqual([expect.stringMatching(/needs "format" or "compiler", not both/)]);
    expect(errorsFor(seed, { memos: { format: 'json', fields: { title: { from: 'body' } } } })).toEqual([expect.stringMatching(/"fields" applies only to format "markdown-tree"/)]);
    expect(errorsFor({}, { Memos: { format: 'json' } })).toEqual([expect.stringMatching(/Must be lowercase alphanumeric with hyphens/)]);
  });
});

describe('seedHooks', () => {
  const pack = { id: 'test-pack', name: 'Test', version: '0.1.0', entities: { Memo: 'Memo' } };

  it('accepts hooks for an entity type the pack declares', () => {
    expect(parseManifest({ ...pack, seedHooks: { Memo: 'src/memo-hooks.ts#memoSeedHooks' } }).errors).toEqual([]);
  });

  it("rejects hooks for an entity type the pack doesn't declare", () => {
    expect(parseManifest({ ...pack, seedHooks: { Action: 'src/hooks.ts#actionHooks' } }).errors)
      .toEqual([expect.stringMatching(/Seed hooks for "Action": only entity types this pack declares/)]);
  });

  it('rejects a target without an export name', () => {
    expect(parseManifest({ ...pack, seedHooks: { Memo: 'src/memo-hooks.ts' } }).errors).toEqual([expect.stringMatching(/Must be "path#exportName"/)]);
  });
});

describe('services', () => {
  const pack = { id: 'test-pack', name: 'Test', version: '0.1.0' };
  const feature = (services: Record<string, string>) => ({ ...pack, features: [{ id: 'memos', services }] });

  it('accepts feature and pack-level services naming their export', () => {
    expect(parseManifest({ ...feature({ memo: 'src/features/memos/be/services/memo.ts#memoService' }), packServices: { cache: 'src/cache#cacheService' } }).errors).toEqual([]);
  });

  it('rejects a service path without an export name', () => {
    expect(parseManifest(feature({ memo: 'src/features/memos/be/services/memo.ts' })).errors).toEqual([expect.stringMatching(/Must be "path#exportName"/)]);
    expect(parseManifest({ ...pack, packServices: { cache: 'src/cache' } }).errors).toEqual([expect.stringMatching(/Must be "path#exportName"/)]);
  });

  it('rejects a service name that is not an identifier', () => {
    expect(parseManifest({ ...pack, packServices: { 'my-cache': 'src/cache.ts#cacheService' } }).errors).toEqual([expect.stringMatching(/Must be an identifier/)]);
  });
});
