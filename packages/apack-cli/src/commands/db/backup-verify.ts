import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { readBackup } from '@apackdev/host/backup';
import { errorMessage } from '@apackdev/sdk/utils/pure';
import type { DbIo } from './target';

export const VERIFY_USAGE = 'Usage: apack db backup verify <dir> [--json]';

export function verifyBackup(dir: string) {
  const contents = readBackup(dir);
  if (contents.unknownDatabases.length) throw new Error(`Unsupported backup databases: ${contents.unknownDatabases.join(', ')}`);
  if (contents.missingDatabases.length) throw new Error(`Missing backup databases: ${contents.missingDatabases.join(', ')}`);
  const metadata = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json'), 'utf8'));
  if ((metadata.includesMedia && !contents.hasMedia)
    || (contents.hasMedia && !fs.statSync(path.join(dir, 'media')).isDirectory())) {
    throw new Error('The backup media directory is missing or is not a directory.');
  }
  return { valid: true, path: dir, ...contents };
}

export async function dbBackupVerify(args: string[], io: DbIo): Promise<void> {
  const { values, positionals } = parseArgs({ args, options: { json: { type: 'boolean' } }, allowPositionals: true, strict: true });
  if (positionals.length !== 1) throw new Error(VERIFY_USAGE);
  const dir = path.resolve(positionals[0]!);
  let result;
  try {
    result = verifyBackup(dir);
  } catch (error) {
    if (values.json) io.out(JSON.stringify({ valid: false, path: dir, error: errorMessage(error) }));
    throw error;
  }
  if (values.json) io.out(JSON.stringify(result));
  else io.out(`Valid backup: ${result.path}\nDatabases: ${result.databases.join(', ')}\nMedia: ${result.hasMedia ? 'included' : 'none'}${result.appVersion ? `\nApp version: ${result.appVersion}` : ''}`);
}
