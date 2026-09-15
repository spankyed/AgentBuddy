#!/usr/bin/env tsx
/**
 * One-off, for this machine's production app: prepares its data for the build that keeps API keys in the
 * encrypted host store and tracks edits to seeded rows. Run it once, with the production app quit, then delete
 * this script.
 *
 * Needs packages/default-setup/dist built from this branch (npm run build). It prints what it would do and
 * writes nothing unless given --apply:
 *
 *   cd packages/api
 *   ABUDDY_ENV=production ABUDDY_USER_DATA_DIR=<the production app's data dir> \
 *     node ../../scripts/with-source.mjs tsx --tsconfig tsconfig.scripts.json scripts/db/fix-prod-upgrade.ts [--apply]
 *
 * The production app's data dir is its userData folder (the "abuddy" folder in the macOS app support folder).
 *
 * What it does:
 * 1. Deletes ears-secrets and ears-secrets-backup, the old API key database, which held keys unencrypted.
 *    Keys are entered again in Settings → Secrets.
 * 2. Moves the CLI path overrides from general.secrets.cliPaths to plugins.code.cliPaths, and removes
 *    general.secrets.
 * 3. Gives default-setup's seeded rows (actions, prompts, library, notes and flows) their seed key and a
 *    record of their seeded values, which the seeders now need to find a row and to tell whether it was edited:
 *    - a row whose record hasn't changed since it was seeded is recorded against the record's values, so a row
 *      that still holds them takes later seed changes, and a row that doesn't (edited) is left alone by them;
 *    - a row whose record has changed is recorded as it's stored, so the next launch updates it;
 *    - a flow is recorded as it's stored (its graph can't be compared with its DSL), so an edit made to a
 *      seeded flow is kept until that flow's seed next changes.
 *    Rows without a sourceHash (created by the user) are left alone.
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
import { closeDatabase, openDatabase, packagesDir } from './database';

const apply = process.argv.includes('--apply');
const PACK_ID = 'default-setup';
const COMPILED_DIR = path.join(packagesDir, 'default-setup', 'dist');
const SETTINGS_ID = 'Settings-app' as EARS.EntityId;

/** default-setup's generic seed entries, as its generated seeders.ts registers them */
const ENTRIES = [
  { key: 'actions', identity: ['label'] },
  { key: 'prompts', identity: ['label'] },
  { key: 'library', identity: ['name'], media: true },
  { key: 'notes', identity: ['title', 'parent'], relKind: 'contains' },
] as const;

const attr = (name: string) => name as EARS.AttrKind;
const hash = (values: unknown[]) => crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0, 16);
const readJSON = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
const counts: Record<string, number> = {};
const count = (what: string) => { counts[what] = (counts[what] ?? 0) + 1; };

/** A write, made only with --apply */
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
  try {
    process.kill(pid, 0);
  } catch {
    return;
  }
  throw new Error(`The app is running on ${userDataDir} (pid ${pid}): quit it first`);
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
  if (Object.keys(cliPaths).length > 0 && Object.keys(current ?? {}).length === 0) {
    console.log(`  move CLI paths to plugins.code.cliPaths: ${JSON.stringify(cliPaths)}`);
    stored.plugins = { ...stored.plugins, code: { ...stored.plugins?.code, cliPaths } };
  } else if (Object.keys(cliPaths).length > 0) {
    console.log(`  plugins.code.cliPaths already set (${JSON.stringify(current)}): not moving ${JSON.stringify(cliPaths)}`);
  }
  delete stored.general.secrets;
  write('remove general.secrets', () => tx(SETTINGS_ID).put('data', stored).put('updatedAt', Date.now()));
}

// ── 3. Seeded rows ──────────────────────────────────────────────────────────

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
    console.log(`\n3. Seeded ${entry.key}`);
    const file = path.join(COMPILED_DIR, `${entry.key}.seed.json`);
    const { records } = readJSON<{ records: SeedRecord[] }>(file);
    const mediaDir = path.join(COMPILED_DIR, 'media', entry.key);
    const relKind = 'relKind' in entry ? entry.relKind : 'contains';

    const findRow = (record: SeedRecord, context: SeedHookContext): EARS.EntityId | undefined => {
      const hooks = record.entity ? seedHookRegistry.get(record.entity) : undefined;
      if (hooks?.find) return hooks.find(record, context)?.id;
      const fields = entry.identity.filter((name) => name !== 'parent');
      const candidates = findWhere<Record<string, unknown> & { id: EARS.EntityId }>(record.entity as EARS.Entity, fields[0], record[fields[0]])
        .filter((row) => fields.slice(1).every((name) => row[name] === record[name]));
      const match = (entry.identity as readonly string[]).includes('parent')
        ? candidates.find((row) => qx(row.id).linksTo(relKind, undefined, false).ids()[0] === context.parentId)
        : candidates[0];
      return match?.id;
    };

    const visit = (items: SeedRecord[], parentId: EARS.EntityId | undefined, parentKey: string) => {
      items.forEach((record, index) => {
        const label = recordLabel(record, [...entry.identity]);
        const id = findRow(record, { parentId, index });
        if (!id) {
          console.log(`  ${label}: not in the database (the next launch seeds it)`);
          count('not in the database');
          return;
        }
        const seedKey = childSeedKey(parentKey, record, entry.identity);
        const storedHash = getAttr(id, attr('sourceHash')) as string | null;
        if (!storedHash) {
          console.log(`  ${label}: no sourceHash, user-owned: left alone`);
          count('user-owned');
        } else if (getAttr(id, attr('seededFields')) !== null) {
          console.log(`  ${label}: already recorded`);
          count('already recorded');
        } else {
          const fields = Object.keys(record).filter((key) => !['entity', 'children', 'sourceHash'].includes(key)).sort();
          const stored = hash(fields.map((field) => getAttr(id, attr(field)) ?? null));
          let recorded = stored;
          let outcome = 'record changed: recorded as stored, the next launch updates it';
          if (storedHash === record.sourceHash) {
            recorded = hash(fields.map((field) => (entry.key === 'library' ? withRowMedia(record[field], id, mediaDir) : record[field]) ?? null));
            outcome = recorded === stored ? 'unchanged and unedited: recorded' : 'unchanged but edited: recorded as edited, later seeds leave it alone';
          }
          count(outcome.split(':')[0]);
          write(`${label}: ${outcome}`, () => {
            if (getAttr(id, attr('seedKey')) === null) updateAttr(id, attr('seedKey'), seedKey);
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
  console.log('\n3. Seeded flows');
  const flowsDSL = readJSON<Record<string, unknown>>(path.join(COMPILED_DIR, 'flows.seed.json'));
  const labelMap = (entity: string) => new Map<string, string>(findAll<{ id: string; label: string }>(entity as EARS.Entity).map((row) => [row.label, row.id]));
  const maps = { actions: labelMap('Action'), prompts: labelMap('Prompt') };
  const ROW_KEYS = new Set(['id', 'sourceHash', 'createdAt']);

  for (const [name, entry] of Object.entries(flowsDSL)) {
    const flow = findWhere<{ id: EARS.EntityId }>('Flow' as EARS.Entity, 'label', name).find((row) => getAttr(row.id, attr('sourceHash')));
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
    write(`${name}: ${changed ? 'DSL changed: recorded as stored, the next launch replaces it' : 'recorded as stored'}`, () => {
      if (getAttr(flow.id, attr('seedKey')) === null) updateAttr(flow.id, attr('seedKey'), `${PACK_ID}:flows/${encodeURIComponent(JSON.stringify(['Flow', name]))}`);
      updateAttr(flow.id, attr('seededGraph'), { ...seeded, hash: hashGraph(flow.id, seeded) });
    });
  }
}

async function run(): Promise<void> {
  const { env, userDataDir } = resolveAppContext();
  console.log(`${apply ? 'Applying to' : 'Dry run (pass --apply to write) on'} the ${env} data dir: ${userDataDir}`);
  assertAppQuit(userDataDir);
  const index = readJSON<{ packId?: string }>(path.join(COMPILED_DIR, 'seeds.json'));
  if (index.packId !== PACK_ID) throw new Error(`${COMPILED_DIR}/seeds.json isn't this branch's build: run npm run build first`);

  await openDatabase();
  try {
    moveCliPaths();
    stampGenericRows();
    stampFlows();
  } finally {
    closeDatabase();
  }
  removeOldKeyDatabase(userDataDir);
  console.log('\nSummary:', counts);
  if (!apply) console.log('\nNothing was written. Run again with --apply to make these changes.');
}

run().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
