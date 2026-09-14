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
    for (const entities of [{ Relation: 'Relation' }, { Link: 'Relation' }, { Action: 'Action' }, { Run: 'TNode' }, { Key: 'Secret' }]) {
      expect(parseManifest({ ...pack, entities }).errors).toEqual([expect.stringMatching(/"entities": Relation, Flow, Node, TNode, Action, Prompt, Settings, Secret are defined by the SDK/)]);
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

describe('boot.seed entries', () => {
  const pack = { id: 'test-pack', name: 'Test', version: '0.1.0', entities: { Memo: 'Memo' } };
  const errorsFor = (seed: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    parseManifest({ ...pack, ...extra, boot: { seed } }).errors;

  it('accepts specialty paths, format, compiler and seeder entries', () => {
    expect(errorsFor({
      actions: 'src/seeds/actions',
      flows: { path: 'src/seeds/flows' },
      memos: {
        path: 'src/seeds/memos', format: 'markdown-tree', entity: 'Memo', identity: ['title', 'parent'],
        tree: { branch: 'index.md', relKind: 'contains' },
        fields: { title: { from: 'frontmatter.title', default: 'filename', type: 'string' }, body: { from: 'body' } },
        media: 'media',
      },
      tags: { path: 'src/seeds/tags.json', format: 'json', entity: 'Memo', identity: ['name'] },
      docs: { path: 'src/seeds/docs', compiler: 'src/seeds/compile-docs.ts', entity: ['Memo'] },
      custom: { seeder: 'src/seeds/custom.ts' },
    })).toEqual([]);
  });

  it('rejects a path string for a key the SDK does not compile', () => {
    expect(errorsFor({ library: 'src/seeds/library' })).toEqual([expect.stringMatching(/"boot\.seed\.library": Unknown seed key "library"/)]);
  });

  it('rejects an object entry without format, compiler or seeder', () => {
    expect(errorsFor({ memos: { path: 'src/seeds/memos', entity: 'Memo' } })).toEqual([expect.stringMatching(/Seed "memos" needs "format", "compiler" or "seeder"/)]);
  });

  it('rejects anything but a path on a specialty key', () => {
    expect(errorsFor({ actions: { path: 'src/seeds/actions', entity: 'Action' } })).toEqual([expect.stringMatching(/"actions" is compiled by the SDK/)]);
  });

  it('rejects unknown entry fields and field sources', () => {
    expect(errorsFor({ memos: { path: 'p', format: 'json', entityType: 'Memo' } })).toEqual([expect.stringMatching(/Unrecognized key.*entityType/)]);
    expect(errorsFor({ memos: { path: 'p', format: 'markdown-tree', fields: { title: { from: 'heading' } } } }))
      .toEqual([expect.stringMatching(/"boot\.seed\.memos\.fields\.title\.from": Must be "body", "filename", "path" or "frontmatter\.<name>"/)]);
  });

  it('rejects format with compiler, a missing path, and fields outside markdown-tree', () => {
    expect(errorsFor({ memos: { path: 'p', format: 'json', compiler: 'c.ts' } })).toEqual([expect.stringMatching(/either "format" or "compiler"/)]);
    expect(errorsFor({ memos: { format: 'json' } })).toEqual([expect.stringMatching(/"path" is required/)]);
    expect(errorsFor({ memos: { path: 'p', format: 'json', fields: { title: { from: 'body' } } } })).toEqual([expect.stringMatching(/"fields" applies only to format "markdown-tree"/)]);
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
