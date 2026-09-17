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

  it("rejects declaring the SDK's entities or relation kinds, by name or value, naming each", () => {
    const pack = { id: 'test-pack', name: 'Test', version: '0.1.0' };
    const errorsOf = (field: object) => parseManifest({ ...pack, ...field }).errors;
    expect(errorsOf({ entities: { Relation: 'Relation', Memo: 'Memo' } })).toEqual([
      'abuddy.json "entities": "Relation" is defined by the SDK and available to every pack: remove it',
    ]);
    expect(errorsOf({ relKinds: { CONTAINS: 'contains', NEXT: 'transitions_to', HOLDS: 'holds', PINNED: 'pinned' } })).toEqual([
      'abuddy.json "relKinds": "CONTAINS": "contains", "NEXT": "transitions_to" are defined by the SDK and available to every pack: remove them',
    ]);
    expect(errorsOf({ relKinds: { CONTAINS: 'holds' } })).toEqual([expect.stringContaining('"CONTAINS": "holds" is defined by the SDK')]);
    // A name only an object's prototype has is a pack's to use
    expect(errorsOf({ entities: { constructor: 'constructor', toString: 'toString' } })).toEqual([]);
    // Settings is a pack's entity (default-setup's)
    expect(errorsOf({ entities: { Memo: 'Memo', Note: 'Note', Settings: 'Settings' }, relKinds: { PINNED: 'pinned' } })).toEqual([]);
  });

  it("rejects an entity whose key isn't its type name", () => {
    const errors = parseManifest({ id: 'test-pack', name: 'Test', version: '0.1.0', entities: { Memo: 'memo', Note: 'Note' } }).errors;
    expect(errors).toEqual(['abuddy.json "entities.Memo": an entity\'s key must be its type name: use "memo": "memo"']);
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

  it('rejects feature ids generated code reserves: reserved words and busId', () => {
    const pack = { id: 'test-pack', name: 'Test', version: '0.1.0' };
    for (const id of ['default', 'export', 'busId']) {
      expect(parseManifest({ ...pack, features: [{ id }] }).errors).toEqual([expect.stringContaining(`"${id}" is reserved in generated code`)]);
    }
    expect(parseManifest({ ...pack, features: [{ id: 'defaults' }, { id: 'specs' }] }).errors).toEqual([]);
  });

  it('rejects an app extension name that is not an identifier', () => {
    const pack = { id: 'test-pack', name: 'Test', version: '0.1.0' };
    expect(parseManifest({ ...pack, fe: { appExtensions: { 'my-ext': 'x.vue' } } }).errors).toEqual([expect.stringContaining('Must be an identifier')]);
    expect(parseManifest({ ...pack, fe: { appExtensions: { welcome: 'x.vue' } } }).errors).toEqual([]);
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

  it('accepts specialty paths, entries naming own or dependency formats, seeder entries, and format entries with a seeder', () => {
    expect(errorsFor({
      actions: 'src/seeds/actions',
      flows: { path: 'src/seeds/flows' },
      memos: { path: 'src/seeds/memos', format: 'memos' },
      tags: { path: 'src/seeds/tags.json', format: 'tags' },
      docs: { path: 'src/seeds/docs', format: 'docs' },
      notes: { path: 'src/seeds/notes', format: 'base-pack:notes' },
      custom: { seeder: 'src/seeds/custom.ts' },
      pinned: { path: 'src/seeds/pinned.json', format: 'tags', seeder: 'src/seeds/pinned.ts' },
    }, {
      memos,
      tags: { format: 'json', entity: 'Memo', identity: ['name'] },
      docs: { compiler: 'src/seeds/compilers/docs.ts', entity: ['Memo'] },
    })).toEqual([]);
  });

  it('rejects a path string for a key the SDK does not compile', () => {
    expect(errorsFor({ library: 'src/seeds/library' })).toEqual([expect.stringMatching(/"boot\.seed\.library": Unknown seed key "library"/)]);
  });

  it('rejects an entry that is neither { path, format } (with or without a seeder) nor { seeder }', () => {
    const shape = /Seed "memos" must be \{ "path", "format" \}, optionally with "seeder", or \{ "seeder" \}/;
    expect(errorsFor({ memos: { path: 'src/seeds/memos' } })).toEqual([expect.stringMatching(shape)]);
    expect(errorsFor({ memos: { format: 'memos' } })).toEqual([expect.stringMatching(shape)]);
    expect(errorsFor({ memos: { seeder: 's.ts', path: 'p' } })).toEqual([expect.stringMatching(shape)]);
    expect(errorsFor({ memos: { seeder: 's.ts', format: 'memos' } })).toEqual([expect.stringMatching(shape)]);
    expect(errorsFor({ memos: {} })).toEqual([expect.stringMatching(shape)]);
  });

  it('rejects format settings on an entry: they belong to a seedFormats format', () => {
    expect(errorsFor({ memos: { path: 'p', format: 'memos', fields: { title: { from: 'body' } } } })).toEqual([expect.stringMatching(/Unrecognized key.*fields/)]);
    expect(errorsFor({ memos: { path: 'p', format: 'memos', entity: 'Memo' } })).toEqual([expect.stringMatching(/Unrecognized key.*entity/)]);
  });

  it("treats settings as a pack's own seed key: an entry, in any pack", () => {
    expect(errorsFor({ settings: 'src/seeds/default-settings.ts' })).toEqual([expect.stringMatching(/"boot\.seed\.settings": Unknown seed key "settings": only actions, prompts, flows take a path/)]);
    expect(errorsFor({ settings: { path: 'src/seeds/settings.json', format: 'memos', seeder: 'src/seeds/settings.ts' } })).toEqual([]);
  });

  it('rejects the removed boot.earlySystem and boot.createDefaultSettings', () => {
    expect(parseManifest({ ...pack, builtIn: true, boot: { earlySystem: 'src/system.ts' } }).errors).toEqual([expect.stringMatching(/"boot".*Unrecognized key.*earlySystem/)]);
    expect(parseManifest({ ...pack, builtIn: true, boot: { createDefaultSettings: 'src/settings.ts' } }).errors).toEqual([expect.stringMatching(/"boot".*Unrecognized key.*createDefaultSettings/)]);
  });

  it('accepts features[].earlySystem only in a built-in pack: early systems start before external packs load', () => {
    const features = [{ id: 'logs', earlySystem: true, system: { entry: 'src/logs/system.ts' } }];
    expect(parseManifest({ ...pack, features }).errors).toEqual([expect.stringMatching(/"features\.0\.earlySystem": An early system starts before EARS hydration/)]);
    expect(parseManifest({ ...pack, builtIn: true, features }).errors).toEqual([]);
  });

  it('rejects anything but a path on a specialty key', () => {
    expect(errorsFor({ actions: { path: 'src/seeds/actions', format: 'memos' } })).toEqual([expect.stringMatching(/"actions" is compiled by the SDK/)]);
  });

  it('rejects seed keys that aren\'t plain names: they become file paths and identifiers', () => {
    for (const key of ['../x', 'x/y', 'a_b', 'Memos', '']) {
      expect(errorsFor({ [key]: { path: 'p', format: 'memos' } }), key).toEqual([expect.stringMatching(/Must be a lowercase letter, then lowercase letters, digits and hyphens/)]);
    }
    expect(errorsFor({ 'quick-memos': { path: 'p', format: 'memos' } })).toEqual([]);
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

  it('rejects a markdown-tree format with a list of entities: it seeds one entity type', () => {
    const seed = { memos: { path: 'p', format: 'memos' } };
    expect(errorsFor(seed, { memos: { ...memos, entity: ['Memo'] } }))
      .toEqual([expect.stringMatching(/"seedFormats\.memos\.entity": Format "markdown-tree" seeds one entity type/)]);
  });

  it('rejects a media directory outside the entry\'s path', () => {
    const seed = { memos: { path: 'p', format: 'memos' } };
    for (const media of ['..', '../shared', 'media/../..', '/abs', 'C:/x', 'a\\b', './media', 'media/', '']) {
      expect(errorsFor(seed, { memos: { ...memos, media } }), media)
        .toEqual([expect.stringMatching(/"seedFormats\.memos\.media": Must be a relative directory under the entry's path/)]);
    }
    expect(errorsFor(seed, { memos: { ...memos, media: 'assets/images' } })).toEqual([]);
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

describe('commands', () => {
  const pack = { id: 'test-pack', name: 'Test', version: '0.1.0' };
  const withCommands = (commands: Array<Record<string, unknown>>) => ({ ...pack, commands });

  it('accepts lowercase names with hyphens, each with its placeholder', () => {
    expect(parseManifest(withCommands([{ name: 'standup', placeholder: 'Topic' }, { name: 'team-digest', placeholder: 'Week (optional)' }])).errors).toEqual([]);
  });

  it('rejects a name that is not a command: uppercase, a leading slash, digit or hyphen, a space', () => {
    for (const name of ['Standup', '/standup', '2do', '-standup', 'team digest', 'team_digest']) {
      expect(parseManifest(withCommands([{ name, placeholder: 'x' }])).errors)
        .toEqual([expect.stringMatching(/Must be a lowercase letter, then lowercase letters, digits and hyphens/)]);
    }
  });

  it('rejects a command without a placeholder or with an empty one, and unknown keys on one', () => {
    expect(parseManifest(withCommands([{ name: 'standup' }])).errors.length).toBeGreaterThan(0);
    expect(parseManifest(withCommands([{ name: 'standup', placeholder: '' }])).errors[0]).toContain('placeholder');
    expect(parseManifest(withCommands([{ name: 'standup', placeholder: 'x', action: 'Standup' }])).errors[0]).toContain('action');
  });

  it("rejects a name the pack declares twice, and one on a feature: they're the pack's", () => {
    expect(parseManifest(withCommands([{ name: 'standup', placeholder: 'a' }, { name: 'standup', placeholder: 'b' }])).errors)
      .toEqual([expect.stringContaining('Command "standup" is declared twice')]);
    expect(parseManifest({ ...pack, features: [{ id: 'memos', commands: [{ name: 'standup', placeholder: 'a' }] }] }).errors[0]).toContain('commands');
  });
});
