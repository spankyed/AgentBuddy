import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseManifest } from '../../src/build/validate.ts';
import { _MOVED_ROOT_KEYS } from '../../src/build/manifest-schema.ts';

describe('parseManifest', () => {
  it('accepts default-setup apack.json', () => {
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, '../../../default-setup/apack.json'), 'utf-8'),
    );
    const result = parseManifest(raw);
    expect(result.errors).toEqual([]);
  });

  it("rejects declaring the SDK's entities or relation kinds, by name or value, naming each", () => {
    const pack = { id: 'test-pack', name: 'Test', version: '0.1.0' };
    const errorsOf = (field: object) => parseManifest({ ...pack, ...field }).errors;
    expect(errorsOf({ entities: { Relation: 'Relation', Memo: 'Memo' } })).toEqual([
      'apack.json "entities": "Relation" is defined by the SDK and available to every pack: remove it',
    ]);
    expect(errorsOf({ relKinds: { CONTAINS: 'contains', NEXT: 'transitions_to', HOLDS: 'holds', PINNED: 'pinned' } })).toEqual([
      'apack.json "relKinds": "CONTAINS": "contains", "NEXT": "transitions_to" are defined by the SDK and available to every pack: remove them',
    ]);
    expect(errorsOf({ relKinds: { CONTAINS: 'holds' } })).toEqual([expect.stringContaining('"CONTAINS": "holds" is defined by the SDK')]);
    // A name only an object's prototype has is a pack's to use
    expect(errorsOf({ entities: { constructor: 'constructor', toString: 'toString' } })).toEqual([]);
    // Settings is a pack's entity (default-setup's)
    expect(errorsOf({ entities: { Memo: 'Memo', Note: 'Note', Settings: 'Settings' }, relKinds: { PINNED: 'pinned' } })).toEqual([]);
  });

  it("rejects an entity whose key isn't its type name", () => {
    const errors = parseManifest({ id: 'test-pack', name: 'Test', version: '0.1.0', entities: { Memo: 'memo', Note: 'Note' } }).errors;
    expect(errors).toEqual(['apack.json "entities.Memo": an entity\'s key must be its type name: use "memo": "memo"']);
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
      features: { main: { system: { entry: 'src/system.ts', exportName: 'mainEntry' } } },
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

  it('rejects feature ids generated code reserves: reserved words', () => {
    const pack = { id: 'test-pack', name: 'Test', version: '0.1.0' };
    for (const id of ['default', 'export', 'eval']) {
      expect(parseManifest({ ...pack, features: { [id]: {} } }).errors).toEqual([expect.stringContaining(`"${id}" is reserved in generated code`)]);
    }
    expect(parseManifest({ ...pack, features: { defaults: {}, specs: {} } }).errors).toEqual([]);
  });

  // JSON cannot hold a key twice, so this is a property of the format rather than a check anything runs:
  // two features with one id used to collapse last-wins across five generated modules, silently
  it('cannot be given one feature id twice', () => {
    const pack = { id: 'test-pack', name: 'Test', version: '0.1.0' };
    const parsed = JSON.parse('{"notes": {"settings": "a.ts"}, "notes": {"settings": "b.ts"}}');
    expect(Object.keys(parsed)).toEqual(['notes']);
    expect(parseManifest({ ...pack, features: parsed }).errors).toEqual([]);
  });

  /**
   * `.strict()` refuses a contribution key at the root, which is the whole of the rule — but on its own it
   * says no more than "Unrecognized key", and the one thing a reader needs is where the key went. The names
   * are derived from the section's own shape, so a key added to `extensions` is named here without an edit.
   */
  it('names where a contribution key went when it is found at the root', () => {
    const pack = { id: 'test-pack', name: 'Test', version: '0.1.0' };
    for (const [key, to] of Object.entries(_MOVED_ROOT_KEYS)) {
      expect(parseManifest({ ...pack, [key]: {} }).errors, key)
        .toEqual([expect.stringContaining(`"${key}" is now "${to}"`)]);
    }
    // Every key the section holds, and the two that moved elsewhere
    expect(Object.keys(_MOVED_ROOT_KEYS).sort())
      .toEqual(['artifacts', 'blocks', 'bundleUi', 'commands', 'dsl', 'fe', 'packServices', 'services', 'steps']);
  });

  // The hint is for a key that moved; an unrecognized key that never existed gets the plain message
  it('says nothing extra about a root key that was never a contribution', () => {
    const errors = parseManifest({ id: 'test-pack', name: 'Test', version: '0.1.0', nonsense: 1 }).errors;
    expect(errors).toEqual([expect.stringContaining('nonsense')]);
    expect(errors[0]).not.toContain('is now');
  });

  it('rejects an app extension name that is not an identifier', () => {
    const pack = { id: 'test-pack', name: 'Test', version: '0.1.0' };
    expect(parseManifest({ ...pack, extensions: { fe: { appExtensions: { 'my-ext': 'x.vue' } } } }).errors).toEqual([expect.stringContaining('Must be an identifier')]);
    expect(parseManifest({ ...pack, extensions: { fe: { appExtensions: { welcome: 'x.vue' } } } }).errors).toEqual([]);
  });
});

describe('the pack id', () => {
  // The app is the pack `host`: its features are `host/<feature>`, so a pack of that id would share them
  it("refuses the host's own", () => {
    expect(parseManifest({ id: 'host', name: 'Host', version: '0.1.0' }).errors)
      .toEqual([expect.stringContaining('"host" is the app\'s own pack id')]);
    expect(parseManifest({ id: 'hosted', name: 'Hosted', version: '0.1.0' }).errors).toEqual([]);
  });
});

describe('content.formats, content.sources and content.datasets', () => {
  const pack = { id: 'test-pack', name: 'Test', version: '0.1.0', entities: { Memo: 'Memo' }, dependencies: { 'base-pack': '*' } };
  const memos = {
    format: 'markdown-tree', entity: 'Memo', identity: ['title', 'parent'],
    tree: { branch: 'index.md', relKind: 'contains' },
    fields: { title: { from: 'frontmatter.title', default: 'filename', type: 'string' }, body: { from: 'body' } },
    media: 'media',
  };
  const errorsFor = (sources: Record<string, unknown>, formats: Record<string, unknown> = { memos }) =>
    parseManifest({ ...pack, content: { formats, sources } }).errors;
  const datasetErrors = (datasets: Record<string, unknown>, formats: Record<string, unknown> = { memos }) =>
    parseManifest({ ...pack, content: { formats, datasets } }).errors;

  it('accepts specialty paths, sources naming own or dependency formats, applier sources, and format sources with an applier', () => {
    expect(errorsFor({
      actions: 'src/content/actions',
      flows: { path: 'src/content/flows' },
      memos: { path: 'src/content/memos', format: 'memos' },
      tags: { path: 'src/content/tags.json', format: 'tags' },
      docs: { path: 'src/content/docs', format: 'docs' },
      notes: { path: 'src/content/notes', format: 'base-pack:notes' },
      custom: { applier: 'src/content/custom.ts' },
      pinned: { path: 'src/content/pinned.json', format: 'tags', applier: 'src/content/pinned.ts' },
    }, {
      memos,
      tags: { format: 'json', entity: 'Memo', identity: ['name'] },
      docs: { compiler: 'src/content/compilers/docs.ts', entity: ['Memo'] },
    })).toEqual([]);
  });

  it('rejects a path string for a key the SDK does not compile', () => {
    expect(errorsFor({ library: 'src/content/library' })).toEqual([expect.stringMatching(/"content\.sources\.library": Unknown content key "library"/)]);
  });

  it('rejects a source that is neither { path, format } (with or without an applier) nor { applier }', () => {
    const shape = /Content "memos" must be \{ "path", "format" \}, optionally with "applier", or \{ "applier" \}/;
    expect(errorsFor({ memos: { path: 'src/content/memos' } })).toEqual([expect.stringMatching(shape)]);
    expect(errorsFor({ memos: { format: 'memos' } })).toEqual([expect.stringMatching(shape)]);
    expect(errorsFor({ memos: { applier: 's.ts', path: 'p' } })).toEqual([expect.stringMatching(shape)]);
    expect(errorsFor({ memos: { applier: 's.ts', format: 'memos' } })).toEqual([expect.stringMatching(shape)]);
    expect(errorsFor({ memos: {} })).toEqual([expect.stringMatching(shape)]);
  });

  /**
   * A dataset is compiled and never written, so it takes no applier — and a key is a file name in the
   * compiled output, so the two sections cannot share one.
   */
  it('takes { path, format } for a dataset, and refuses an applier or a key a source has', () => {
    expect(datasetErrors({ faqs: { path: 'src/content/faqs', format: 'memos' } })).toEqual([]);
    expect(datasetErrors({ faqs: { path: 'p', format: 'memos', applier: 'a.ts' } }))
      .toEqual([expect.stringMatching(/Dataset "faqs" must be \{ "path", "format" \}: it is compiled and never written/)]);
    expect(datasetErrors({ faqs: { format: 'memos' } }))
      .toEqual([expect.stringMatching(/Dataset "faqs" must be \{ "path", "format" \}/)]);
    expect(parseManifest({
      ...pack,
      content: { formats: { memos }, sources: { memos: { path: 'p', format: 'memos' } }, datasets: { memos: { path: 'q', format: 'memos' } } },
    }).errors).toEqual([expect.stringMatching(/"memos" is both a content source and a dataset/)]);
  });

  it('rejects format settings on a source: they belong to a content.formats format', () => {
    expect(errorsFor({ memos: { path: 'p', format: 'memos', fields: { title: { from: 'body' } } } })).toEqual([expect.stringMatching(/Unrecognized key.*fields/)]);
    expect(errorsFor({ memos: { path: 'p', format: 'memos', entity: 'Memo' } })).toEqual([expect.stringMatching(/Unrecognized key.*entity/)]);
  });

  it("treats settings as a pack's own content key: a source, in any pack", () => {
    expect(errorsFor({ settings: 'src/content/default-settings.ts' })).toEqual([expect.stringMatching(/"content\.sources\.settings": Unknown content key "settings": only actions, prompts, flows take a path/)]);
    expect(errorsFor({ settings: { path: 'src/content/settings.json', format: 'memos', applier: 'src/content/settings.ts' } })).toEqual([]);
  });

  // `earlySystem` was a built-in pack's privilege, policed by a refinement that named it. The capability is
  // gone, so there is nothing left to permit and no bespoke message to write: an unknown key is an unknown
  // key, which `.strict()` refuses for every pack alike
  it('refuses features[].earlySystem as the unknown key it now is, in any pack', () => {
    const features = { logs: { earlySystem: true, system: { entry: 'src/logs/system.ts' } } };
    expect(parseManifest({ ...pack, features }).errors).toEqual([expect.stringMatching(/features\.logs.*[Uu]nrecognized key/)]);
    expect(parseManifest({ ...pack, builtIn: true, features }).errors).toEqual([expect.stringMatching(/features\.logs.*[Uu]nrecognized key/)]);
  });

  // Which plugin opens first is an annotation on the plugin, not a feature id at the root: an id there
  // could name a feature the pack doesn't have, and codegen then emitted no default at all. A pack
  // claiming none has no default plugin, which the shell handles.
  it('takes the default plugin from the plugin that claims it, and refuses two claims', () => {
    const plugin = (id: string, isDefault?: boolean) =>
      ({ [id]: { plugin: { entry: `src/${id}/fe/plugin.ts`, ...(isDefault ? { default: true } : {}) } } });

    expect(parseManifest({ ...pack, features: { ...plugin('notes'), ...plugin('cards', true) } }).errors).toEqual([]);
    expect(parseManifest({ ...pack, features: { ...plugin('notes', true), ...plugin('cards', true) } }).errors)
      .toEqual([expect.stringMatching(/"features\.cards\.plugin\.default": Two features claim the default plugin: "notes" and "cards"/)]);
  });

  it('has no root defaultPlugin to name a feature that may not exist', () => {
    expect(parseManifest({ ...pack, defaultPlugin: 'threads' }).errors).toEqual([expect.stringMatching(/Unrecognized key.*defaultPlugin/)]);
  });

  it('rejects anything but a path on a specialty key', () => {
    expect(errorsFor({ actions: { path: 'src/content/actions', format: 'memos' } })).toEqual([expect.stringMatching(/"actions" is compiled by the SDK/)]);
  });

  it('rejects content keys that aren\'t plain names: they become file paths and identifiers', () => {
    for (const key of ['../x', 'x/y', 'a_b', 'Memos', '']) {
      expect(errorsFor({ [key]: { path: 'p', format: 'memos' } }), key).toEqual([expect.stringMatching(/Must be a lowercase letter, then lowercase letters, digits and hyphens/)]);
    }
    expect(errorsFor({ 'quick-memos': { path: 'p', format: 'memos' } })).toEqual([]);
  });

  it("rejects a format name that isn't in content.formats, or a dependency prefix that isn't a dependency", () => {
    expect(errorsFor({ memos: { path: 'p', format: 'notes' } })).toEqual([expect.stringMatching(/"content\.sources\.memos\.format": Content "memos": no format "notes" in content\.formats/)]);
    expect(errorsFor({ memos: { path: 'p', format: 'other-pack:notes' } })).toEqual([expect.stringMatching(/format "other-pack:notes" names "other-pack", which isn't a dependency/)]);
    expect(errorsFor({ memos: { path: 'p', format: 'Not A Name' } })).toEqual([expect.stringMatching(/Must be a content\.formats name, or "<dependency id>:<name>"/)]);
    // A dataset's format is checked in the same two places
    expect(datasetErrors({ faqs: { path: 'p', format: 'notes' } }))
      .toEqual([expect.stringMatching(/"content\.datasets\.faqs\.format": Content "faqs": no format "notes" in content\.formats/)]);
  });

  it('rejects unknown format keys, bad field sources, and format/compiler misuse', () => {
    const sources = { memos: { path: 'p', format: 'memos' } };
    expect(errorsFor(sources, { memos: { format: 'json', entityType: 'Memo' } })).toEqual([expect.stringMatching(/Unrecognized key.*entityType/)]);
    expect(errorsFor(sources, { memos: { format: 'markdown-tree', fields: { title: { from: 'heading' } } } }))
      .toEqual([expect.stringMatching(/"content\.formats\.memos\.fields\.title\.from": Must be "body", "filename", "path" or "frontmatter\.<name>"/)]);
    expect(errorsFor(sources, { memos: { format: 'json', compiler: 'c.ts' } })).toEqual([expect.stringMatching(/needs "format" or "compiler", not both/)]);
    expect(errorsFor(sources, { memos: { entity: 'Memo' } })).toEqual([expect.stringMatching(/needs "format" or "compiler", not both/)]);
    expect(errorsFor(sources, { memos: { format: 'json', fields: { title: { from: 'body' } } } })).toEqual([expect.stringMatching(/"fields" applies only to format "markdown-tree"/)]);
    expect(errorsFor({}, { Memos: { format: 'json' } })).toEqual([expect.stringMatching(/Must be a lowercase letter, then lowercase letters, digits and hyphens/)]);
  });

  it('rejects a markdown-tree format with a list of entities: it writes one entity type', () => {
    expect(errorsFor({ memos: { path: 'p', format: 'memos' } }, { memos: { ...memos, entity: ['Memo'] } }))
      .toEqual([expect.stringMatching(/"content\.formats\.memos\.entity": Format "markdown-tree" writes one entity type/)]);
  });

  it('rejects a media directory outside the source\'s path', () => {
    const sources = { memos: { path: 'p', format: 'memos' } };
    for (const media of ['..', '../shared', 'media/../..', '/abs', 'C:/x', 'a\\b', './media', 'media/', '']) {
      expect(errorsFor(sources, { memos: { ...memos, media } }), media)
        .toEqual([expect.stringMatching(/"content\.formats\.memos\.media": Must be a relative directory under the entry's path/)]);
    }
    expect(errorsFor(sources, { memos: { ...memos, media: 'assets/images' } })).toEqual([]);
  });
});

describe('content.writers', () => {
  const pack = { id: 'test-pack', name: 'Test', version: '0.1.0', entities: { Memo: 'Memo' } };

  it('accepts a writer for an entity type the pack declares', () => {
    expect(parseManifest({ ...pack, content: { writers: { Memo: 'src/memo-writers.ts#memoWriter' } } }).errors).toEqual([]);
  });

  it("rejects a writer for an entity type the pack doesn't declare", () => {
    expect(parseManifest({ ...pack, content: { writers: { Action: 'src/writers.ts#actionWriter' } } }).errors)
      .toEqual([expect.stringMatching(/A content writer for "Action": only entity types this pack declares/)]);
  });

  it('rejects a target without an export name', () => {
    expect(parseManifest({ ...pack, content: { writers: { Memo: 'src/memo-writers.ts' } } }).errors).toEqual([expect.stringMatching(/Must be "path#exportName"/)]);
  });
});

describe('services', () => {
  const pack = { id: 'test-pack', name: 'Test', version: '0.1.0' };
  const feature = (services: Record<string, string>) => ({ ...pack, features: { memos: { services } } });

  it('accepts feature and pack-level services naming their export', () => {
    expect(parseManifest({ ...feature({ memo: 'src/features/memos/be/services/memo.ts#memoService' }), extensions: { services: { cache: 'src/cache#cacheService' } } }).errors).toEqual([]);
  });

  it('rejects a service path without an export name', () => {
    expect(parseManifest(feature({ memo: 'src/features/memos/be/services/memo.ts' })).errors).toEqual([expect.stringMatching(/Must be "path#exportName"/)]);
    expect(parseManifest({ ...pack, extensions: { services: { cache: 'src/cache' } } }).errors).toEqual([expect.stringMatching(/Must be "path#exportName"/)]);
  });

  it('rejects a service name that is not an identifier', () => {
    expect(parseManifest({ ...pack, extensions: { services: { 'my-cache': 'src/cache.ts#cacheService' } } }).errors).toEqual([expect.stringMatching(/Must be an identifier/)]);
  });
});

describe('commands', () => {
  const pack = { id: 'test-pack', name: 'Test', version: '0.1.0' };
  const withCommands = (commands: Record<string, unknown>) => ({ ...pack, extensions: { commands } });

  it('accepts lowercase names with hyphens as keys, each with its placeholder', () => {
    expect(parseManifest(withCommands({ standup: { placeholder: 'Topic' }, 'team-digest': { placeholder: 'Week (optional)' } })).errors).toEqual([]);
  });

  it('rejects a key that is not a command: uppercase, a leading slash, digit or hyphen, a space, an underscore', () => {
    for (const name of ['Standup', '/standup', '2do', '-standup', 'team digest', 'team_digest']) {
      expect(parseManifest(withCommands({ [name]: { placeholder: 'x' } })).errors)
        .toEqual([expect.stringMatching(/Must be a lowercase letter, then lowercase letters, digits and hyphens/)]);
    }
  });

  it('rejects a command without a placeholder or with an empty one, and unknown keys on one', () => {
    expect(parseManifest(withCommands({ standup: {} })).errors.length).toBeGreaterThan(0);
    expect(parseManifest(withCommands({ standup: { placeholder: '' } })).errors[0]).toContain('placeholder');
    expect(parseManifest(withCommands({ standup: { placeholder: 'x', action: 'Standup' } })).errors[0]).toContain('action');
  });

  // The name is the key, so declaring one twice is unrepresentable rather than refused: JSON cannot hold a
  // key twice, which is why the check that used to say so is gone. What is still refused is a command on a
  // feature — commands are the pack's.
  it("refuses one on a feature: they're the pack's", () => {
    expect(parseManifest({ ...pack, features: { memos: { commands: { standup: { placeholder: 'a' } } } } }).errors[0]).toContain('commands');
  });
});
