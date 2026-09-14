// A pack that depends on default-setup seeds Notes from its own markdown with no seed hooks of its
// own (tests/fixtures/dependent-pack). Its notes go through default-setup's Note hooks, so they get
// the rows default-setup's own notes entry seeds from the same sources: NOTE shortCodes, display
// order, CONTAINS nesting and REFERENCES links.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildPackConfigFromManifest, compilePack, generatePackFiles, parseManifest, type PackManifest, type PackSnapshot } from '@abuddy/sdk/build';
import { createSeeder } from '@abuddy/sdk/seed';
import { PACK_DIR, resetDatabase, snapshot } from './harness';

const FIXTURE = path.join(PACK_DIR, 'tests/fixtures/dependent-pack');
const KEY = 'team-notes';
const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'abuddy.json'), 'utf-8')) as PackManifest;
const ownManifest = JSON.parse(fs.readFileSync(path.join(PACK_DIR, 'abuddy.json'), 'utf-8')) as PackManifest;

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

async function compile(packDir: string, pack: PackManifest): Promise<string> {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dependent-pack-'));
  dirs.push(outputDir);
  await compilePack({ packDir, outputDir, packConfig: await buildPackConfigFromManifest(pack, packDir) });
  return outputDir;
}

/** Seeds a compiled notes key the way the generated seeders.ts registers it */
function seedNotes(compiledDir: string, key: string, entry: { identity?: string[]; tree?: { relKind?: string } }) {
  return createSeeder({ key, identity: entry.identity, relKind: entry.tree?.relKind }).seed({ compiledDir, log: () => {} });
}

describe('a pack depending on default-setup seeds notes', () => {
  it('declares a valid manifest whose Note entity comes from its dependency, and registers no hooks', () => {
    expect(parseManifest(manifest).errors).toEqual([]);
    const snapshot = JSON.parse(fs.readFileSync(path.join(PACK_DIR, 'dist/snapshot.json'), 'utf-8')) as PackSnapshot;
    const files = generatePackFiles(manifest, { packRoot: FIXTURE, depSnapshots: new Map([['default-setup', snapshot]]) });
    expect(files['src/__generated__/seeders.ts']).toContain(`registerSeeder(createSeeder({"key":"${KEY}","identity":["title","parent"],"relKind":"contains"}));`);
    expect(files['src/__generated__/pack-entry.ts']).not.toContain('seedHooks');
    // Without the dependency, Note isn't a known entity
    expect(() => generatePackFiles({ ...manifest, dependencies: {} }, { packRoot: FIXTURE })).toThrow(`entity "Note" isn't declared`);
  });

  it("gets NOTE shortCodes, display order, nesting and REFERENCES from default-setup's hooks", async () => {
    resetDatabase();
    const entry = manifest.boot!.seed![KEY] as { identity?: string[]; tree?: { relKind?: string } };
    const counts = seedNotes(await compile(FIXTURE, manifest), KEY, entry);
    expect(counts).toEqual({ created: 4, updated: 0, skipped: 0 });

    const { rows, relations } = snapshot();
    expect(rows['Note:Team Handbook']).toMatchObject({ shortCode: expect.stringMatching(/^NOTE-\d+$/), icon: '📘', favorite: true, lastSeen: 0, sourceHash: expect.any(String) });
    expect(rows['Note:Roadmap']).toMatchObject({ noteType: 'tasklist', displayOrder: 1 });
    expect(rows['Note:Roadmap/ship it']).toMatchObject({ noteType: 'task', displayOrder: 0, completed: false });
    expect(rows['Note:Roadmap/write docs']).toMatchObject({ noteType: 'task', displayOrder: 1, completed: true });
    expect(relations).toEqual(expect.arrayContaining([
      'Note:Roadmap --contains--> Note:Roadmap/ship it',
      'Note:Roadmap --contains--> Note:Roadmap/write docs',
      'Note:Team Handbook --references--> Note-roadmap-plan',
    ]));
  });

  it("seeds the same rows as default-setup's own notes entry on the same sources", async () => {
    resetDatabase();
    const entry = manifest.boot!.seed![KEY] as { identity?: string[]; tree?: { relKind?: string } };
    seedNotes(await compile(FIXTURE, manifest), KEY, entry);
    const dependent = snapshot();

    resetDatabase();
    const ownEntry = ownManifest.boot!.seed!.notes as Record<string, unknown>;
    const source = path.relative(PACK_DIR, path.join(FIXTURE, 'src/seeds/team-notes'));
    const own = { ...ownManifest, steps: undefined, artifacts: undefined, blocks: undefined, boot: { seed: { notes: { ...ownEntry, path: source } } } } as PackManifest;
    seedNotes(await compile(PACK_DIR, own), 'notes', ownEntry);

    expect(dependent).toEqual(snapshot());
  });
});
