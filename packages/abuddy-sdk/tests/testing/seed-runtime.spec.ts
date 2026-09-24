// A built pack's seed runtime (dist/build/seed-runtime.mjs) loaded into a bare SDK test runtime: no
// host, no app. default-setup's is the example: a Note seeded through it gets default-setup's rows.
import { installedEngine as ears } from '@abuddy/ears';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerSeedRuntime, resetTestData, startTestRuntime, type SeedRuntime } from '../../src/testing/index.ts';
import { compileBuiltinFormat } from '../../src/build/seeds/records.ts';
import { createSeeder } from '../../src/seed/seeder.ts';
import { findRelations } from '@abuddy/ears';
import type { PackManifest } from '../../src/build/manifest.ts';

const DEFAULT_SETUP = path.resolve(import.meta.dirname, '../../../default-setup');
const FACET = path.join(DEFAULT_SETUP, 'dist', 'build', 'seed-runtime.mjs');
// dist/ is gitignored; CI builds default-setup (abuddy build) and requires the facet
const built = fs.existsSync(FACET);
if (!built && process.env.REQUIRE_SEED_RUNTIME) throw new Error(`${FACET} is required (REQUIRE_SEED_RUNTIME) but not built`);

describe.skipIf(!built)("a built pack's seed runtime", () => {
  let dir: string;
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-runtime-'));
    process.env.ABUDDY_ENV ??= 'test';
    process.env.ABUDDY_USER_DATA_DIR ??= dir;
    startTestRuntime();
    const { seedRuntime } = await import(pathToFileURL(FACET).href) as { seedRuntime: SeedRuntime };
    registerSeedRuntime(seedRuntime);
    resetTestData();
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("registers the pack's repositories and seed hooks, so seeding goes through them", async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DEFAULT_SETUP, 'abuddy.json'), 'utf-8')) as PackManifest;
    const source = path.join(dir, 'notes');
    fs.mkdirSync(path.join(source, 'plan'), { recursive: true });
    fs.writeFileSync(path.join(source, 'intro.md'), '---\ntitle: Intro\n---\nSee the [plan](note://Note-plan-target).\n');
    fs.writeFileSync(path.join(source, 'plan', 'index.md'), '---\ntitle: Plan\ntype: tasklist\n---\nSteps.\n');
    fs.writeFileSync(path.join(source, 'plan', 'first.md'), '---\ntype: task\n---\nDo it.\n');
    const compiled = path.join(dir, 'compiled');
    fs.mkdirSync(compiled);
    fs.writeFileSync(path.join(compiled, 'seeds.json'), JSON.stringify({ version: 1, packId: 'default-setup', seeds: [] }));
    fs.writeFileSync(path.join(compiled, 'notes.seed.json'), JSON.stringify({ records: compileBuiltinFormat('notes', manifest.seedFormats!.notes, source) }));

    const format = manifest.seedFormats!.notes;
    const counts = createSeeder({ key: 'notes', entities: ['Note'], identity: format.identity, relKind: format.tree?.relKind }).apply({ compiledDir: compiled, log: () => {} });
    expect(counts).toEqual({ created: 3, updated: 0, skipped: 0 });

    const notes = ears().findWhere<Record<string, unknown> & { id: string }>('Note', 'title', 'Intro');
    expect(notes[0]).toMatchObject({ shortCode: expect.stringMatching(/^NOTE-\d+$/), lastSeen: 0 });
    expect(findRelations({ sourceEntity: notes[0].id as never, relationType: 'references' })).toEqual([
      expect.objectContaining({ targetEntity: 'Note-plan-target' }),
    ]);
    const [plan] = ears().findWhere<Record<string, unknown> & { id: string }>('Note', 'title', 'Plan');
    expect(findRelations({ sourceEntity: plan.id as never, relationType: 'contains' })).toHaveLength(1);
  });
});
