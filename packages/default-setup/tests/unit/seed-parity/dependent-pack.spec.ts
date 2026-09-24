// A pack that depends on default-setup seeds Notes and library documents from its own markdown with
// entries naming default-setup's formats (tests/fixtures/dependent-pack): no field maps, compiler
// modules or seed hooks of its own. Its notes go through default-setup's Note hooks and its library
// through default-setup's bundled compiler module (dist/build/seed-compilers.mjs) and library hooks,
// so it gets the rows default-setup's own entries seed from the same sources: NOTE shortCodes,
// display order, nesting, REFERENCES links, DOC shortCodes, sections, media and sourceHash.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  buildPackConfigFromManifest, compilePack, formatEntities, generatePackFiles, parseManifest, resolveSeeds,
  type PackManifest, type PackSnapshot, type SeedDependency,
} from '@abuddy/sdk/build';
import { createSeeder } from '@abuddy/sdk/seed';
import { PACK_DIR, resetDatabase, snapshot } from './harness';

const FIXTURE = path.join(PACK_DIR, 'tests/fixtures/dependent-pack');
const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'abuddy.json'), 'utf-8')) as PackManifest;
/** default-setup as a dependent's build sees it: its built snapshot and build dir */
const depSnapshot = JSON.parse(fs.readFileSync(path.join(PACK_DIR, 'dist/snapshot.json'), 'utf-8')) as PackSnapshot;
const dependencies = new Map<string, SeedDependency>([['default-setup', { manifest: depSnapshot.manifest, buildDir: path.join(PACK_DIR, 'dist/build') }]]);

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

async function compile(packDir: string, pack: PackManifest, deps?: ReadonlyMap<string, SeedDependency>): Promise<string> {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dependent-pack-'));
  dirs.push(outputDir);
  await compilePack({ packDir, outputDir, packConfig: await buildPackConfigFromManifest(pack, packDir, { dependencies: deps }) });
  return outputDir;
}

/** Seeds each compiled format key the way the generated seeders.ts registers it */
function importAll(compiledDir: string, pack: PackManifest, packDir: string, deps?: ReadonlyMap<string, SeedDependency>) {
  return Object.fromEntries(Object.entries(resolveSeeds(pack, packDir, deps)).flatMap(([key, seed]) => {
    if (seed.kind !== 'format') return [];
    const { identity, tree, media } = seed.format;
    return [[key, createSeeder({ key, entities: formatEntities(seed.format), identity, relKind: tree?.relKind, media: !!media }).apply({ compiledDir, log: () => {} })]];
  }));
}

describe('a pack depending on default-setup seeds with its formats', () => {
  it("declares only a path and default-setup's format per entry, and registers no hooks", () => {
    expect(parseManifest(manifest).errors).toEqual([]);
    for (const entry of Object.values(manifest.boot!.seed!)) {
      expect(Object.keys(entry as object).sort()).toEqual(['format', 'path']);
    }
    const files = generatePackFiles(manifest, { packRoot: FIXTURE, depSnapshots: new Map([['default-setup', depSnapshot]]) });
    expect(files['src/__generated__/seeders.ts']).toContain('  createSeeder({"key":"team-notes","entities":["Note"],"identity":["title","parent"],"relKind":"contains"}),');
    expect(files['src/__generated__/seeders.ts']).toContain('  createSeeder({"key":"team-docs","entities":["Collection","Document"],"identity":["name"],"media":true}),');
    expect(files['src/__generated__/pack-entry.ts']).not.toContain('seedHooks');
    // Without the dependency, its formats can't be resolved
    expect(() => generatePackFiles({ ...manifest, dependencies: {} }, { packRoot: FIXTURE })).toThrow(`format "default-setup:notes" names "default-setup", which isn't a resolved dependency`);
  });

  it("gets NOTE and DOC shortCodes, order, nesting, sections, media and REFERENCES from default-setup's format and hooks", async () => {
    resetDatabase();
    const counts = importAll(await compile(FIXTURE, manifest, dependencies), manifest, FIXTURE, dependencies);
    expect(counts).toEqual({
      'team-notes': { created: 4, updated: 0, skipped: 0 },
      'team-docs': { created: 2, updated: 0, skipped: 0 },
    });

    const { rows, relations, media } = snapshot();
    expect(rows['Note:Team Handbook']).toMatchObject({ shortCode: expect.stringMatching(/^NOTE-\d+$/), icon: '📘', favorite: true, lastSeen: 0, sourceHash: expect.any(String) });
    expect(rows['Note:Roadmap']).toMatchObject({ noteType: 'tasklist', displayOrder: 1 });
    expect(rows['Note:Roadmap/ship it']).toMatchObject({ noteType: 'task', displayOrder: 0, completed: false });
    expect(rows['Note:Roadmap/write docs']).toMatchObject({ noteType: 'task', displayOrder: 1, completed: true });
    expect(rows['Collection:Team Playbooks']).toMatchObject({ description: 'How the team runs things', sourceHash: expect.any(String) });
    expect(rows['Document:On-call']).toMatchObject({
      shortCode: expect.stringMatching(/^DOC-\d+$/),
      tags: ['ops', 'rota'],
      content: [
        { type: 'markdown', text: 'Page the owner first. ![rota](media://Document:On-call/rota.png)' },
        { type: 'list', items: ['Acknowledge', 'Mitigate'] },
      ],
    });
    expect(media).toEqual(['Document:On-call/rota.png=ROTA']);
    expect(relations).toEqual(expect.arrayContaining([
      'Note:Roadmap --contains--> Note:Roadmap/ship it',
      'Note:Roadmap --contains--> Note:Roadmap/write docs',
      'Note:Team Handbook --references--> Note-roadmap-plan',
      'Collection:Team Playbooks --contains--> Document:On-call',
    ]));
  });

  it("seeds the same rows as default-setup's own entries on the same sources", async () => {
    resetDatabase();
    importAll(await compile(FIXTURE, manifest, dependencies), manifest, FIXTURE, dependencies);
    const dependent = snapshot();

    resetDatabase();
    const source = (dir: string) => path.relative(PACK_DIR, path.join(FIXTURE, 'src/seeds', dir));
    const own = {
      ...depSnapshot.manifest, steps: undefined, artifacts: undefined, blocks: undefined,
      boot: { seed: { 'team-notes': { path: source('team-notes'), format: 'notes' }, 'team-docs': { path: source('team-docs'), format: 'library' } } },
    } as PackManifest;
    importAll(await compile(PACK_DIR, own), own, PACK_DIR);

    expect(dependent).toEqual(snapshot());
  });
});
