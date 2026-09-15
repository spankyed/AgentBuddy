#!/usr/bin/env tsx
/**
 * One-off, for this machine's production app: prepares its data for the build that keeps API keys in the
 * encrypted host store and tracks edits to seeded rows. Run it once, with the production app quit, then delete
 * this script.
 *
 * It prints what it would do and writes nothing unless given --apply:
 *
 *   cd packages/api
 *   ABUDDY_ENV=production ABUDDY_USER_DATA_DIR=<the production app's data dir> \
 *     node ../../scripts/with-source.mjs tsx --tsconfig tsconfig.scripts.json scripts/db/fix-prod-upgrade.ts [--apply]
 *
 * The production app's data dir is its userData folder (the "abuddy" folder in the macOS app support folder).
 *
 * Before running:
 * 1. Quit the production app (the script refuses while it runs on the data dir).
 * 2. Back up the whole data dir while the app is closed: cp -Rp "<data dir>" "<data dir>.backup"
 * 3. npm run build, so packages/default-setup/dist is built from this branch's sources (the script refuses an
 *    older build).
 * 4. Dry run first (no --apply) and read the output, including the summary's lists:
 *    - "unchanged but edited" rows are recorded as edited: later seeds leave them alone;
 *    - "record changed" rows and "flow changed" flows are replaced by the next launch, so edits made to them
 *      are overwritten: export anything worth keeping first.
 * 5. Check the output for failures ("Failed:", [LMDB] errors, a non-zero exit). A failed LMDB flush stops the
 *    script before it deletes the old key database: restore the backup before trying again.
 * 6. After --apply, launch the new build and enter the API keys again in Settings → Secrets.
 *
 * What it does:
 * 1. Deletes ears-secrets and ears-secrets-backup, the old API key database, which held keys unencrypted.
 *    Keys are entered again in Settings → Secrets.
 * 2. Moves the CLI path overrides from general.secrets.cliPaths to plugins.code.cliPaths, and removes
 *    general.secrets.
 * 3. Deletes the seeded library document internal/commands: slash commands now come from the documents of an
 *    internal/commands folder, which the next launch seeds.
 * 4. Gives default-setup's seeded rows (actions, prompts, library, notes and flows) their seed key and a
 *    record of their seeded values, which the seeders now need to find a row and to tell whether it was edited:
 *    - a row whose record hasn't changed since it was seeded is recorded against the record's values, so a row
 *      that still holds them takes later seed changes, and a row that doesn't (edited) is left alone by them;
 *    - a row whose record has changed is recorded as it's stored, so the next launch updates it;
 *    - a flow is recorded as it's stored (its graph can't be compared with its DSL), so an edit made to a
 *      seeded flow is kept until that flow's seed next changes.
 *    Rows without a sourceHash (created by the user) are left alone, except notes: v0.3.14's notes import
 *    never stored a sourceHash, so a note without a sourceHash or seed key that matches a current notes record
 *    by identity (its title under the same parent chain, the notes seed hook's find) is taken for the note
 *    v0.3.14 seeded. It gets the record's sourceHash, and its seeded values are recorded as the record's: one
 *    that still holds them takes later seed changes, one that doesn't is recorded as edited and kept. A note
 *    the user created with the same title in the same place (for v0.3.14's welcome note, a root note titled
 *    exactly "welcome") can't be told apart from it and is treated the same; v0.3.14's own import overwrote
 *    such a note's content with the welcome text, so it treated that note as seeded too.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveAppContext } from '@abuddy/sdk/env';
import { findRelations, tx } from '@abuddy/sdk/ears';
import { findAll, findWhere, getAttr, qx, updateAttr } from '@abuddy/host/ears';
import { recordLabel, seedHookRegistry, type SeedHookContext, type SeedRecord } from '@abuddy/sdk/seed';
import { compileFlowDSL, type CompiledRows } from '@abuddy/sdk/build';
import type { EARS } from '@abuddy/sdk';
import { closeDatabase, flushDatabase, openDatabase, packagesDir, persistenceErrorCount } from './database';

const apply = process.argv.includes('--apply');
const PACK_ID = 'default-setup';
const PACK_DIR = path.join(packagesDir, 'default-setup');
const COMPILED_DIR = path.join(PACK_DIR, 'dist');
const SETTINGS_ID = 'Settings-app' as EARS.EntityId;

/** default-setup's generic seed entries, as its generated seeders.ts registers them */
const ENTRIES = [
  { key: 'actions', identity: ['label'] },
  { key: 'prompts', identity: ['label'] },
  { key: 'library', identity: ['name'], media: true },
  { key: 'notes', identity: ['title', 'parent'], relKind: 'contains' },
] as const;

const attr = (name: string) => name as EARS.AttrKind;
const SEED_KEY = attr('seedKey');
const hash = (values: unknown[]) => crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0, 16);
const readJSON = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
const counts: Record<string, number> = {};
const count = (what: string) => { counts[what] = (counts[what] ?? 0) + 1; };
/** Rows the next launch replaces or updates (edits to them are overwritten), and rows recorded as edited */
const replacedNextLaunch: string[] = [];
const recordedAsEdited: string[] = [];

/** A planned change: printed (labelled in a dry run), and made only with --apply */
function write(description: string, change: () => void): void {
  console.log(`  ${apply ? '' : '(dry run) '}${description}`);
  if (apply) change();
}

/** Refuses while the app runs on this data dir: it would overwrite these changes from memory */
function assertAppQuit(userDataDir: string): void {
  const lock = path.join(userDataDir, 'SingletonLock');
  let target: string;
  try {
    target = fs.readlinkSync(lock);
  } catch {
    return;
  }
  const pid = Number(target.slice(target.lastIndexOf('-') + 1));
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`Can't read the app's pid from ${lock} (${target}): quit the app, and if it isn't running, delete that file`);
  }
  try {
    process.kill(pid, 0);
  } catch (err) {
    // ESRCH: no such process. EPERM means it exists but belongs to someone else, so it counts as running.
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') return;
  }
  throw new Error(`The app is running on ${userDataDir} (pid ${pid}): quit it first (if it isn't the app, delete ${lock})`);
}

/** Refuses a default-setup build older than its seed sources or abuddy.json */
function assertBuildCurrent(): void {
  const indexFile = path.join(COMPILED_DIR, 'seeds.json');
  if (!fs.existsSync(indexFile)) throw new Error(`${indexFile} is missing: run npm run build first`);
  const index = readJSON<{ packId?: string }>(indexFile);
  if (index.packId !== PACK_ID) throw new Error(`${indexFile} isn't this branch's build: run npm run build first`);
  const builtAt = fs.statSync(indexFile).mtimeMs;
  const seedsDir = path.join(PACK_DIR, 'src', 'seeds');
  const sources = [
    path.join(PACK_DIR, 'abuddy.json'),
    ...fs.readdirSync(seedsDir, { recursive: true, encoding: 'utf-8' }).map((file) => path.join(seedsDir, file)),
  ];
  const newer = sources.filter((file) => fs.statSync(file).isFile() && fs.statSync(file).mtimeMs > builtAt);
  if (newer.length > 0) {
    throw new Error(`${indexFile} is older than ${newer.length} source file(s), e.g. ${path.relative(packagesDir, newer[0])}: run npm run build first`);
  }
}

// ── 1. The old API key database ─────────────────────────────────────────────

function removeOldKeyDatabase(userDataDir: string): void {
  console.log('\n1. Old API key database');
  for (const name of ['ears-secrets', 'ears-secrets-backup']) {
    const dir = path.join(userDataDir, name);
    if (!fs.existsSync(dir)) {
      console.log(`  ${name}: not there`);
      continue;
    }
    write(`delete ${name}`, () => fs.rmSync(dir, { recursive: true, force: true }));
  }
}

// ── 2. Settings ─────────────────────────────────────────────────────────────

function moveCliPaths(): void {
  console.log('\n2. Settings');
  const stored = structuredClone((getAttr(SETTINGS_ID, attr('data')) ?? {}) as Record<string, any>);
  const secrets = stored.general?.secrets as { cliPaths?: Record<string, unknown> } | undefined;
  if (!secrets) {
    console.log('  general.secrets: not there');
    return;
  }
  const cliPaths = Object.fromEntries(Object.entries(secrets.cliPaths ?? {}).filter(([, value]) => typeof value === 'string' && value.trim() !== ''));
  const current = stored.plugins?.code?.cliPaths as Record<string, string> | undefined;
  let description = 'remove general.secrets';
  if (Object.keys(cliPaths).length > 0 && Object.keys(current ?? {}).length === 0) {
    stored.plugins = { ...stored.plugins, code: { ...stored.plugins?.code, cliPaths } };
    description = `move CLI paths to plugins.code.cliPaths (${JSON.stringify(cliPaths)}) and remove general.secrets`;
  } else if (Object.keys(cliPaths).length > 0) {
    description = `remove general.secrets without moving its CLI paths ${JSON.stringify(cliPaths)}: plugins.code.cliPaths is already set (${JSON.stringify(current)})`;
  }
  delete stored.general.secrets;
  write(description, () => tx(SETTINGS_ID).put('data', stored).put('updatedAt', Date.now()));
}

// ── 3. The old commands document ────────────────────────────────────────────

/**
 * Slash commands moved from one seeded document, internal/commands, to the documents of an internal/commands folder,
 * which the next launch seeds. The old document would sit beside that folder with the same name: delete it.
 */
function removeOldCommandsDocument(): void {
  console.log('\n3. Old commands document');
  const inInternal = new Set(findWhere<{ id: EARS.EntityId }>('Collection' as EARS.Entity, 'name', 'internal')
    .flatMap((collection) => findRelations({ sourceEntity: collection.id, relationType: 'contains' as EARS.RelKind }).map((r) => r.targetEntity as string)));
  const old = findWhere<{ id: EARS.EntityId }>('Document' as EARS.Entity, 'name', 'commands').find((document) => inInternal.has(document.id));
  if (!old) {
    console.log('  internal/commands: not there');
    return;
  }
  const remove = seedHookRegistry.get('Document')?.remove;
  if (!remove) throw new Error('The Document seed hook is not registered: is default-setup built?');
  write('delete the document internal/commands (its commands now come from the internal/commands folder)', () => remove(old.id));
}

// ── 4. Seeded rows ──────────────────────────────────────────────────────────

/** The seed key the generic seeder gives a record (seeder.ts childSeedKey), under its parent's */
function childSeedKey(parentKey: string, record: SeedRecord, identity: readonly string[]): string {
  const fields = identity.filter((name) => name !== 'parent');
  const values = fields.length > 0 ? fields.map((name) => record[name] ?? null) : [recordLabel(record, identity)];
  return `${parentKey}/${encodeURIComponent(JSON.stringify([record.entity ?? null, ...values]))}`;
}

/** A record's value with its media/ links as the seeder rewrites them for the row */
function withRowMedia(value: unknown, id: EARS.EntityId, mediaDir: string): unknown {
  if (typeof value === 'string') {
    let text = value;
    for (const match of value.matchAll(/!\[([^\]]*)\]\((media\/([^)]+))\)/g)) {
      if (fs.existsSync(path.join(mediaDir, match[3]))) text = text.split(`media/${match[3]}`).join(`media://${id}/${match[3]}`);
    }
    return text;
  }
  if (Array.isArray(value)) return value.map((item) => withRowMedia(item, id, mediaDir));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withRowMedia(v, id, mediaDir)]));
  return value;
}

function stampGenericRows(): void {
  for (const entry of ENTRIES) {
    console.log(`\n4. Seeded ${entry.key}`);
    const file = path.join(COMPILED_DIR, `${entry.key}.seed.json`);
    const { records } = readJSON<{ records: SeedRecord[] }>(file);
    const mediaDir = path.join(COMPILED_DIR, 'media', entry.key);
    const relKind = 'relKind' in entry ? entry.relKind : 'contains';

    /** The row the seeder finds for a record (seeder.ts find): by seed key, else by identity when it has no seed key */
    const findRow = (record: SeedRecord, seedKey: string, context: SeedHookContext): EARS.EntityId | undefined => {
      const keyed = record.entity ? findWhere<{ id: EARS.EntityId }>(record.entity as EARS.Entity, SEED_KEY as string, seedKey)[0] : undefined;
      if (keyed) return keyed.id;
      const hooks = record.entity ? seedHookRegistry.get(record.entity) : undefined;
      let match: EARS.EntityId | undefined;
      if (hooks?.find) {
        match = hooks.find(record, context)?.id;
      } else {
        const fields = entry.identity.filter((name) => name !== 'parent');
        const candidates = findWhere<Record<string, unknown> & { id: EARS.EntityId }>(record.entity as EARS.Entity, fields[0], record[fields[0]])
          .filter((row) => fields.slice(1).every((name) => row[name] === record[name]));
        match = ((entry.identity as readonly string[]).includes('parent')
          ? candidates.find((row) => qx(row.id).linksTo(relKind, undefined, false).ids()[0] === context.parentId)
          : candidates[0])?.id;
      }
      return match && getAttr(match, SEED_KEY) === null ? match : undefined;
    };

    const visit = (items: SeedRecord[], parentId: EARS.EntityId | undefined, parentKey: string) => {
      items.forEach((record, index) => {
        const label = recordLabel(record, [...entry.identity]);
        const named = `${entry.key}: ${label}`;
        const seedKey = childSeedKey(parentKey, record, entry.identity);
        const id = findRow(record, seedKey, { parentId, index, clearedFields: [] });
        if (!id) {
          console.log(`  ${label}: not in the database (the next launch seeds it)`);
          count('not in the database');
          return;
        }
        // The fields the seeder tracks (seeder.ts seededFieldNames): every field the record sets but its sourceHash
        const fields = Object.keys(record).filter((key) => !['entity', 'children', 'sourceHash'].includes(key)).sort();
        const storedValues = () => hash(fields.map((field) => getAttr(id, attr(field)) ?? null));
        const recordValues = () => hash(fields.map((field) => (entry.key === 'library' ? withRowMedia(record[field], id, mediaDir) : record[field]) ?? null));
        const storedHash = getAttr(id, attr('sourceHash')) as string | null;

        if (!storedHash && entry.key === 'notes' && getAttr(id, SEED_KEY) === null) {
          const recorded = recordValues();
          const edited = recorded !== storedValues();
          const outcome = edited
            ? 'v0.3.14 seeded note, edited: recorded as edited, later seeds leave it alone'
            : 'v0.3.14 seeded note, unedited: recorded, it takes later seed changes';
          count(outcome.split(':')[0]);
          if (edited) recordedAsEdited.push(named);
          write(`${label}: ${outcome} (no sourceHash; matched by title and parent, so a note of yours with this title in this place is taken for it)`, () => {
            updateAttr(id, attr('sourceHash'), record.sourceHash);
            updateAttr(id, SEED_KEY, seedKey);
            updateAttr(id, attr('seededFields'), { fields, hash: recorded });
          });
        } else if (!storedHash) {
          console.log(`  ${label}: no sourceHash, user-owned: left alone`);
          count('user-owned');
        } else if (getAttr(id, attr('seededFields')) !== null) {
          console.log(`  ${label}: already recorded`);
          count('already recorded');
        } else {
          const stored = storedValues();
          let recorded = stored;
          let outcome = 'record changed: recorded as stored, the next launch updates it';
          if (storedHash === record.sourceHash) {
            recorded = recordValues();
            outcome = recorded === stored ? 'unchanged and unedited: recorded' : 'unchanged but edited: recorded as edited, later seeds leave it alone';
          }
          count(outcome.split(':')[0]);
          if (storedHash !== record.sourceHash) replacedNextLaunch.push(named);
          else if (recorded !== stored) recordedAsEdited.push(named);
          write(`${label}: ${outcome}`, () => {
            if (getAttr(id, SEED_KEY) === null) updateAttr(id, SEED_KEY, seedKey);
            updateAttr(id, attr('seededFields'), { fields, hash: recorded });
          });
        }
        if (record.children) visit(record.children, id, seedKey);
      });
    };
    visit(records, undefined, `${PACK_ID}:${entry.key}`);
  }
}

/** The flow's rows as stored, for the given fields and relation kinds (flow-seeder.ts hashGraph) */
function hashGraph(flowId: EARS.EntityId, seeded: { flowFields: string[]; nodeFields: Record<string, string[]>; relKinds: string[] }): string {
  const values = (id: string, fields: readonly string[] | undefined) => fields?.map((field) => getAttr(id as EARS.EntityId, attr(field)) ?? null) ?? null;
  const nodeIds = findRelations({ sourceEntity: flowId, relationType: 'contains' as EARS.RelKind }).map((r) => r.targetEntity as string).sort();
  const relations = [flowId, ...nodeIds]
    .flatMap((source) => findRelations({ sourceEntity: source as EARS.EntityId }))
    .filter((r) => seeded.relKinds.includes(r.relationType))
    .map((r) => JSON.stringify([r.sourceEntity, r.relationType, r.targetEntity, r.info ?? null]))
    .sort();
  return crypto.createHash('sha256').update(JSON.stringify([values(flowId, seeded.flowFields), nodeIds.map((id) => [id, values(id, seeded.nodeFields[id])]), relations])).digest('hex').slice(0, 16);
}

function stampFlows(): void {
  console.log('\n4. Seeded flows');
  const flowsDSL = readJSON<Record<string, unknown>>(path.join(COMPILED_DIR, 'flows.seed.json'));
  const labelMap = (entity: string) => new Map<string, string>(findAll<{ id: string; label: string }>(entity as EARS.Entity).map((row) => [row.label, row.id]));
  const maps = { actions: labelMap('Action'), prompts: labelMap('Prompt'), flows: labelMap('Flow') };
  const ROW_KEYS = new Set(['id', 'sourceHash', 'createdAt']);

  for (const [name, entry] of Object.entries(flowsDSL)) {
    // flow-seeder.ts flowSeedKey
    const seedKey = `${PACK_ID}:flows/${encodeURIComponent(JSON.stringify(['Flow', name]))}`;
    const flow = findWhere<{ id: EARS.EntityId }>('Flow' as EARS.Entity, SEED_KEY as string, seedKey)[0]
      ?? findWhere<{ id: EARS.EntityId }>('Flow' as EARS.Entity, 'label', name).find((row) => getAttr(row.id, attr('sourceHash')) && getAttr(row.id, SEED_KEY) === null);
    if (!flow) {
      console.log(`  ${name}: no seeded flow with this label (the next launch seeds it)`);
      count('flow not in the database');
      continue;
    }
    if (getAttr(flow.id, attr('seededGraph')) !== null) {
      console.log(`  ${name}: already recorded`);
      continue;
    }
    // The fields and relation kinds the DSL compiles to, tracked on the stored flow and its nodes
    const compiled: CompiledRows = compileFlowDSL({ [name]: entry } as never, maps);
    const rows = compiled.entity as Array<Record<string, unknown> & { id: string; entityType?: string; label?: string }>;
    const keysOf = (row: Record<string, unknown> | undefined) => Object.keys(row ?? {}).filter((key) => !ROW_KEYS.has(key));
    const compiledFlow = rows.find((row) => row.entityType === 'Flow' && row.label === name);
    const compiledNodeIds = new Set(compiled.relation.filter((r) => r.source === compiledFlow?.id && r.kind === 'contains').map((r) => r.target));
    const nodeFieldNames = [...new Set(rows.filter((row) => compiledNodeIds.has(row.id)).flatMap(keysOf))].sort();
    const nodeIds = findRelations({ sourceEntity: flow.id, relationType: 'contains' as EARS.RelKind }).map((r) => r.targetEntity as string);
    const seeded = {
      flowFields: keysOf(compiledFlow).sort(),
      nodeFields: Object.fromEntries(nodeIds.map((id) => [id, nodeFieldNames])),
      relKinds: [...new Set(compiled.relation.filter((r) => r.source === compiledFlow?.id || compiledNodeIds.has(r.source)).map((r) => r.kind))].sort(),
    };
    const changed = getAttr(flow.id, attr('sourceHash')) !== (entry as { sourceHash?: string }).sourceHash;
    count(changed ? 'flow changed' : 'flow unchanged');
    if (changed) replacedNextLaunch.push(`flows: ${name}`);
    write(`${name}: ${changed ? 'flow changed: recorded as stored, the next launch replaces it' : 'recorded as stored'}`, () => {
      if (getAttr(flow.id, SEED_KEY) === null) updateAttr(flow.id, SEED_KEY, seedKey);
      updateAttr(flow.id, attr('seededGraph'), { ...seeded, hash: hashGraph(flow.id, seeded) });
    });
  }
}

function printSummary(): void {
  console.log('\nSummary:', counts);
  const list = (heading: string, names: string[]) => {
    console.log(`\n${heading}: ${names.length === 0 ? 'none' : ''}`);
    for (const name of names) console.log(`  - ${name}`);
  };
  list('Replaced or updated by the next launch (edits to these are overwritten: export them first)', replacedNextLaunch);
  list('Recorded as edited (kept; later seed changes skip them)', recordedAsEdited);
}

async function run(): Promise<void> {
  const { env, userDataDir } = resolveAppContext();
  console.log(`${apply ? 'Applying to' : 'Dry run (pass --apply to write) on'} the ${env} data dir: ${userDataDir}`);
  assertAppQuit(userDataDir);
  assertBuildCurrent();

  // Hydrated as the app boots it (setup/backend.ts), so stored rows hash as the seeders will see them
  await openDatabase({ skipTombstoneScan: true });
  const errorsBefore = persistenceErrorCount();
  let flushFailed = false;
  try {
    moveCliPaths();
    removeOldCommandsDocument();
    stampGenericRows();
    stampFlows();
    // The adapter logs a failed flush instead of throwing: flush now and check, so closing has nothing left to write
    flushFailed = (await flushDatabase()) > errorsBefore;
  } finally {
    closeDatabase();
  }
  if (flushFailed) {
    throw new Error('Writing to LMDB failed (see the [LMDB] errors above): the changes may be partly written, and ears-secrets was not deleted. Restore the data dir backup before trying again.');
  }
  removeOldKeyDatabase(userDataDir);
  printSummary();
  console.log(apply ? '\nDone. Launch the app and enter the API keys again in Settings → Secrets.' : '\nNothing was written. Run again with --apply to make these changes.');
}

run().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
