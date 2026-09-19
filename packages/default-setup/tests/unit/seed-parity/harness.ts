// Seeds default-setup's seed sources through its real manifest entries and snapshots the rows they
// produce, with ids and timestamps normalized, so two pipelines can be compared row for row.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildPackConfigFromManifest, compilePack } from '@abuddy/sdk/build';
import { seedData, type ImportMode, type SeedCounts, type SeedIncludeSet } from '@abuddy/sdk/utils';
import { untypedQx as qx } from '@abuddy/ears';
import { entityIds } from '@abuddy/sdk/testing';
import { resetTestData, testMediaPath } from '@abuddy/testing/harness';

export const PACK_DIR = path.resolve(import.meta.dirname, '../../..');
export const FIXTURES = path.join(PACK_DIR, 'tests/fixtures/seed-parity');

/** The seed keys the parity gate covers */
export const PARITY_KEYS = ['actions', 'prompts', 'library', 'notes'] as const;
const SNAPSHOT_TYPES = ['Action', 'Prompt', 'Document', 'Collection', 'Note'];

const manifest = JSON.parse(fs.readFileSync(path.join(PACK_DIR, 'abuddy.json'), 'utf-8'));

type SeedEntry = string | { path?: string; [key: string]: unknown };

/** The sources a scenario seeds: a fixture version of every parity key, or the pack's own sources */
export type SourceSet = 'v1' | 'v2' | 'default-setup';

function withPath(entry: SeedEntry, sourcePath: string): SeedEntry {
  return typeof entry === 'string' ? sourcePath : { ...entry, path: sourcePath };
}

/** Compiles the parity keys' sources through the pack's manifest entries into a fresh directory */
export async function compileSeeds(sources: SourceSet): Promise<string> {
  const seed: Record<string, SeedEntry> = {};
  for (const key of PARITY_KEYS) {
    const entry = manifest.boot.seed[key] as SeedEntry;
    const own = typeof entry === 'string' ? entry : entry.path!;
    const sourcePath = sources === 'default-setup' ? own : path.relative(PACK_DIR, path.join(FIXTURES, sources, key));
    seed[key] = withPath(entry, sourcePath);
  }
  const pack = { ...manifest, steps: undefined, artifacts: undefined, blocks: undefined, boot: { seed } };
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-parity-'));
  const packConfig = await buildPackConfigFromManifest(pack, PACK_DIR);
  await compilePack({ packDir: PACK_DIR, outputDir, packConfig });
  return outputDir;
}

/** Empties the in-memory database and the media store */
export function resetDatabase(): void {
  resetTestData();
}

export function seed(compiledDir: string, options: { mode?: ImportMode; include?: Record<string, SeedIncludeSet> } = {}): Record<string, SeedCounts> {
  const result = seedData({ compiledDir, mode: options.mode, include: options.include });
  return Object.fromEntries(PARITY_KEYS.map((key) => [key, result[key]]));
}

export interface Snapshot {
  rows: Record<string, Record<string, unknown>>;
  /** `source --kind--> target`, in creation order */
  relations: string[];
  media: string[];
}

const typeOf = (id: string) => id.slice(0, id.indexOf('-'));
// Seed bookkeeping: seededFields hashes stored values that hold ids (media links); edited-rows.spec.ts covers it and seedKey
const DROPPED_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'seededFields', 'seedKey']);

export function snapshot(): Snapshot {
  const ids = entityIds() as string[];
  const rows = new Map<string, Record<string, unknown>>();
  const relations: Array<{ source: string; kind: string; target: string }> = [];
  for (const id of ids) {
    const row = (qx(id as never).pickAll() as Array<Record<string, unknown>>)[0];
    if (!row) continue;
    if (typeOf(id) === 'Relation') {
      const details = row.relationDetails as { sourceEntity: string; targetEntity: string; relationType: string } | undefined;
      if (details) relations.push({ source: details.sourceEntity, kind: details.relationType, target: details.targetEntity });
    } else if (SNAPSHOT_TYPES.includes(typeOf(id))) {
      rows.set(id, row);
    }
  }

  // Stable aliases: type plus identity (a note's is its parent chain)
  // Nesting relations only: a note's REFERENCES link to another note doesn't make it that note's parent
  const parentOf = new Map(relations
    .filter((r) => r.kind !== 'references' && rows.has(r.target) && rows.has(r.source))
    .map((r) => [r.target, r.source]));
  const identity = (id: string): string => {
    const row = rows.get(id)!;
    const own = String(row.name ?? row.title ?? row.label);
    const parent = parentOf.get(id);
    return parent && typeOf(id) === 'Note' ? `${identity(parent)}/${own}` : own;
  };
  const alias = new Map<string, string>();
  for (const id of rows.keys()) {
    let name = `${typeOf(id)}:${identity(id)}`;
    for (let n = 2; [...alias.values()].includes(name); n++) name = `${typeOf(id)}:${identity(id)}#${n}`;
    alias.set(id, name);
  }
  const replaceIds = (text: string) => text.replace(/\b[A-Z][A-Za-z]+-[A-Za-z0-9]{6,}\b/g, (id) => alias.get(id) ?? id);

  const normalized: Snapshot['rows'] = {};
  for (const [id, row] of rows) {
    const fields = Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => !DROPPED_FIELDS.has(key))
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    normalized[alias.get(id)!] = JSON.parse(replaceIds(JSON.stringify(fields)));
  }

  const media: string[] = [];
  const mediaRoot = testMediaPath();
  if (fs.existsSync(mediaRoot)) {
    for (const dir of fs.readdirSync(mediaRoot)) {
      for (const file of fs.readdirSync(path.join(mediaRoot, dir))) {
        // A deleted row's media folder stays behind; its id is gone, so name it by type
        media.push(`${alias.get(dir) ?? `${typeOf(dir)}:(deleted)`}/${file}=${fs.readFileSync(path.join(mediaRoot, dir, file), 'utf-8')}`);
      }
    }
  }

  return {
    rows: Object.fromEntries(Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b))),
    relations: relations
      .filter((r) => rows.has(r.source) || rows.has(r.target))
      .map((r) => `${alias.get(r.source) ?? r.source} --${r.kind}--> ${alias.get(r.target) ?? r.target}`),
    media: media.sort(),
  };
}
