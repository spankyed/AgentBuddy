#!/usr/bin/env tsx
/**
 * Lists every Settings entity and, with --force, destroys them; the app recreates the defaults on its
 * next start. Without --force it's a dry run that changes nothing.
 *
 * Usage (from packages/api, with ABUDDY_ENV and ABUDDY_USER_DATA_DIR set, the app closed):
 *   npm run db:clearSettings               # dry run: lists the rows it would destroy
 *   npm run db:clearSettings -- --force    # destroys them
 */
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { getAll, getEntitiesOfType, tx } from '@abuddy/sdk/ears';
import { openDatabase, closeDatabase, flushDatabase, entity, persistenceErrorCount } from './database';

export interface SettingsRow {
  id: string;
  /** The row's label attribute, when it has one */
  label?: string;
  /** Top-level keys of its stored data (the user's changes from the defaults) */
  dataKeys: string[];
}

export interface ClearSettingsResult {
  rows: SettingsRow[];
  destroyed: boolean;
}

function describeRow(id: string): SettingsRow {
  const attrs = getAll(id as never) as Record<string, unknown>;
  const data = attrs.data;
  return {
    id,
    ...(typeof attrs.label === 'string' ? { label: attrs.label } : {}),
    dataKeys: data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : [],
  };
}

function formatRow(row: SettingsRow): string {
  const label = row.label ? `  label: ${row.label}` : '';
  const keys = row.dataKeys.length ? row.dataKeys.join(', ') : '(none)';
  return `  - ${row.id}${label}  stored keys: ${keys}`;
}

/** Lists the Settings rows in memory, and destroys them only when `force` is set */
export function clearSettings({ force }: { force: boolean }, log: (line: string) => void = console.log): ClearSettingsResult {
  const rows = getEntitiesOfType(entity('Settings')).map(describeRow);

  if (rows.length === 0) {
    log('No Settings rows found; nothing to destroy.');
    return { rows, destroyed: false };
  }

  log(`${force ? 'Destroying' : 'Would destroy'} ${rows.length} Settings row(s):`);
  rows.forEach((row) => log(formatRow(row)));

  if (!force) {
    log('\nDry run: nothing was destroyed. Re-run with --force to destroy these rows.');
    return { rows, destroyed: false };
  }

  rows.forEach((row) => tx(row.id as never).destroy());
  log(`\nDestroyed ${rows.length} Settings row(s). The app recreates the defaults on its next start.`);
  return { rows, destroyed: true };
}

function usage(): string {
  return 'Usage: npm run db:clearSettings [-- --force]\n' +
    '  (no flags)  dry run: list the Settings rows that would be destroyed\n' +
    '  --force     destroy them';
}

async function run() {
  let force: boolean;
  try {
    const { values } = parseArgs({
      options: { force: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h', default: false } },
      strict: true,
    });
    if (values.help) {
      console.log(usage());
      return;
    }
    force = values.force;
  } catch (err) {
    console.error(`${(err as Error).message}\n${usage()}`);
    process.exit(1);
  }

  await openDatabase();
  const errorsBefore = persistenceErrorCount();
  const { destroyed } = clearSettings({ force });
  const flushFailed = destroyed && (await flushDatabase()) > errorsBefore;
  closeDatabase();

  if (flushFailed) {
    console.error('Some writes failed to reach LMDB; the Settings rows may not all be destroyed.');
    process.exit(1);
  }
}

// Run as a script (the spec imports clearSettings)
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  run().catch((err) => {
    console.error('Clear settings failed:', err);
    process.exit(1);
  });
}
