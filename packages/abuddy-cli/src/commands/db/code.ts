// abuddy db query | exec: console code (the Database plugin's) run on the data dir's database
import * as fs from 'node:fs';
import { runQueryCode, runTransactionCode } from '@abuddy/sdk/database-console';
import { consoleScope, openTarget, parseDbArgs, TARGET_USAGE, type DbIo } from './target';
import { outputFormat, writeResult } from './output';

const OPTIONS = {
  file: { type: 'string', short: 'f' },
  output: { type: 'string', short: 'o' },
  out: { type: 'string' },
} as const;

const usage = (command: 'query' | 'exec') => [
  `Usage: abuddy db ${command} <code> | --file <path> [options]`,
  '',
  command === 'query'
    ? 'Runs read-only query code with the Database console\'s read helpers (qx, getAttr, findRelations, getSchemaStats, ...).'
    : 'Runs transaction code with the Database console\'s read and write helpers (tx, destroyEntity, createRelation, ...).',
  'The code is a function body: return the result (`return qx(EARS.Entity.Note).pickAll()`).',
  '',
  'Options:',
  '  -f, --file <path>      Read the code from a file',
  '  -o, --output <format>  pretty (default), json or csv',
  '  --out <file>           Write the result to a file',
  TARGET_USAGE,
].join('\n');

async function runCode(command: 'query' | 'exec', args: string[], io: DbIo): Promise<void> {
  const { values, positionals, target } = parseDbArgs(args, OPTIONS, usage(command));
  const format = outputFormat(values.output);
  if (values.file && positionals.length > 0) throw new Error(`Pass the code or --file, not both\n\n${usage(command)}`);
  const code = values.file ? fs.readFileSync(values.file as string, 'utf-8') : positionals.join(' ');
  if (!code.trim()) throw new Error(`No code to run\n\n${usage(command)}`);

  const write = command === 'exec';
  const db = await openTarget(target, { write, command }, io);
  let result: unknown;
  try {
    result = write ? await runTransactionCode(code, consoleScope(db)) : await runQueryCode(code, consoleScope(db));
  } finally {
    db.close();
  }
  writeResult(result, { format, out: values.out as string | undefined }, io);
}

export const QUERY_USAGE = usage('query');
export const EXEC_USAGE = usage('exec');
export const dbQuery = (args: string[], io: DbIo) => runCode('query', args, io);
export const dbExec = (args: string[], io: DbIo) => runCode('exec', args, io);
