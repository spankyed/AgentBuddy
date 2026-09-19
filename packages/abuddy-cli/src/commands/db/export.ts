// abuddy db export: each entity type's entities, with their attributes, to a file per type
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EARS } from '@abuddy/ears';
import { openTarget, parseDbArgs, TARGET_USAGE, withDatabase, type DbIo } from './target';
import { toCSV, toJSON } from './output';

const OPTIONS = {
  type: { type: 'string', short: 't', multiple: true },
  out: { type: 'string' },
  format: { type: 'string', default: 'json' },
} as const;

export const EXPORT_USAGE = [
  'Usage: abuddy db export --out <dir> [--type <Entity>...] [options]',
  '',
  'Writes each entity type\'s entities, with every attribute, to <dir>/<Entity>.json (or .csv), and a summary to',
  '<dir>/export.json. Roles and relations are in the attributes (`role`, and each relation\'s `relationDetails`, type',
  'Relation).',
  '',
  'Options:',
  '  --out <dir>            Where the files go (required)',
  '  -t, --type <Entity>    An entity type to export; repeat for more (default: every type with entities)',
  '  --format <format>      json (default) or csv',
  TARGET_USAGE,
].join('\n');

export async function dbExport(args: string[], io: DbIo): Promise<void> {
  const { values, positionals, target } = parseDbArgs(args, OPTIONS, EXPORT_USAGE);
  if (positionals.length > 0) throw new Error(`Unexpected argument ${positionals[0]}\n\n${EXPORT_USAGE}`);
  if (!values.out) throw new Error(`--out is required\n\n${EXPORT_USAGE}`);
  const format = values.format as string;
  if (format !== 'json' && format !== 'csv') throw new Error('--format must be json or csv');

  const db = await openTarget(target, { write: false, command: 'export' }, io);
  await withDatabase(db, () => {
    const known = db.schema.getRegisteredEntityTypes();
    const requested = values.type as string[] | undefined;
    const unknown = requested?.filter((type) => !known.has(type)) ?? [];
    if (unknown.length > 0) throw new Error(`Not an entity type of the installed packs: ${unknown.join(', ')}`);
    const types = (requested ?? [...known].sort()).filter((type, index, all) => all.indexOf(type) === index);

    const outDir = path.resolve(values.out as string);
    fs.mkdirSync(outDir, { recursive: true });
    const counts: Record<string, number> = {};
    for (const type of types) {
      const ids = db.query.getEntitiesOfType(type as EARS.Entity);
      if (ids.length === 0 && !requested) continue;
      const rows = ids.map((id) => ({ id, ...db.query.getAll(id) }));
      fs.writeFileSync(path.join(outDir, `${type}.${format}`), format === 'csv' ? toCSV(rows) : `${toJSON(rows)}\n`);
      counts[type] = rows.length;
      io.out(`${type}: ${rows.length}`);
    }
    const summary = {
      exportedAt: new Date().toISOString(),
      userDataDir: db.userDataDir,
      format,
      counts,
    };
    fs.writeFileSync(path.join(outDir, 'export.json'), `${toJSON(summary)}\n`);
    io.err(`Exported ${Object.values(counts).reduce((sum, n) => sum + n, 0)} entities to ${outDir}`);
  });
}
