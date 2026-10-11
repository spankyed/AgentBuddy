import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { readBackup } from '@apackdev/host/backup';
import type { DbIo } from './target';

export const VERIFY_USAGE = 'Usage: apack db backup verify <dir> [--json]';

export function verifyBackup(dir: string) {
  const contents = readBackup(dir);
  if (contents.unknownDatabases.length) throw new Error(`Unsupported backup databases: ${contents.unknownDatabases.join(', ')}`);
  if (contents.missingDatabases.length) throw new Error(`Missing backup databases: ${contents.missingDatabases.join(', ')}`);
  const metadata = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json'), 'utf8'));
  if (metadata.includesMedia && (!contents.hasMedia || !fs.statSync(path.join(dir, 'media')).isDirectory())) {
    throw new Error('The backup declares media but its media directory is missing.');
  }
  return { valid: true, path: dir, ...contents };
}

export async function dbBackupVerify(args: string[], io: DbIo): Promise<void> {
  const { values, positionals } = parseArgs({ args, options: { json: { type: 'boolean' } }, allowPositionals: true, strict: true });
  if (positionals.length !== 1) throw new Error(VERIFY_USAGE);
  const result = verifyBackup(path.resolve(positionals[0]!));
  if (values.json) io.out(JSON.stringify(result));
  else io.out(`Valid backup: ${result.path}\nDatabases: ${result.databases.join(', ')}\nMedia: ${result.hasMedia ? 'included' : 'none'}${result.appVersion ? `\nApp version: ${result.appVersion}` : ''}`);
}
