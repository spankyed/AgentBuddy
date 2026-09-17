// abuddy db script: a script file run against the data dir's database, for work a console one-liner can't do (it
// imports what it likes, and keeps its own helpers). The database is handed to it, rather than left for it to open:
// the published CLI carries its own copy of the engine, so a script importing @abuddy/ears would get a second one.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AppDatabase } from '@abuddy/host/database';
import { consoleScope, openTarget, parseDbArgs, TARGET_USAGE, withDatabase, type DbIo } from './target';
import { outputFormat, writeResult } from './output';

const OPTIONS = {
  'read-only': { type: 'boolean', default: false },
  output: { type: 'string', short: 'o' },
  out: { type: 'string' },
} as const;

export const SCRIPT_USAGE = [
  'Usage: abuddy db script <file> [options] [-- <script arguments>]',
  '',
  'Runs a script file (.ts, .mts, .js or .mjs) against the database. The file default-exports a function, which is',
  'called with the open database and returns its result, printed like a query\'s:',
  '',
  '  export default async ({ db, EARS, args, log }) => {',
  '    const notes = db.query.getEntitiesOfType(EARS.Entity.Note);',
  '    log(`${notes.length} notes`);',
  '    return notes.map((id) => db.query.getAll(id));',
  '  };',
  '',
  '  db     the open database: query (qx, tx, the finders), admin, store, schema, paths, userDataDir',
  '  EARS   the entity types and relation kinds of the packs installed in the data dir',
  '  args   what follows -- on the command line',
  '  log    prints a line, like the script\'s own output',
  '',
  'Options:',
  '  --read-only            Open the database without writing, so the script can run while AgentBuddy does',
  '  -o, --output <format>  pretty (default), json or csv, for what the script returns',
  '  --out <file>           Write that result to a file',
  TARGET_USAGE,
].join('\n');

/** What a script's default export is called with */
export interface DbScriptContext {
  db: AppDatabase;
  EARS: object;
  /** The arguments after `--` */
  args: string[];
  log(line: string): void;
}

/** JavaScript this Node runs as it is */
const JAVASCRIPT = /\.(mjs|cjs|js)$/;

/**
 * The script as a module. TypeScript is compiled beside the file first, with its own relative imports compiled in
 * and its packages left to resolve from where it lives: this process runs through tsx, whose importer only
 * transforms files inside the project, so a script anywhere else would reach Node as TypeScript it can't read.
 */
async function importScript(scriptFile: string): Promise<{ default?: unknown }> {
  if (JAVASCRIPT.test(scriptFile)) return import(pathToFileURL(scriptFile).href) as Promise<{ default?: unknown }>;

  const { build } = await import('esbuild');
  const { outputFiles } = await build({
    entryPoints: [scriptFile],
    bundle: true,
    // Its packages resolve from the script's own directory at run time, not from this bundle
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node22',
    write: false,
    absWorkingDir: path.dirname(scriptFile),
  });
  const compiled = `${scriptFile}.${process.pid}.mjs`;
  try {
    fs.writeFileSync(compiled, outputFiles[0].text);
  } catch (error) {
    throw new Error(`${scriptFile} is TypeScript, which is compiled next to it, and that failed: ${(error as Error).message}`);
  }
  try {
    return await import(pathToFileURL(compiled).href) as { default?: unknown };
  } finally {
    fs.rmSync(compiled, { force: true });
  }
}

export async function dbScript(args: string[], io: DbIo): Promise<void> {
  const { values, positionals, target } = parseDbArgs(args, OPTIONS, SCRIPT_USAGE);
  const format = outputFormat(values.output);
  const [file, ...scriptArgs] = positionals;
  if (!file) throw new Error(`Name the script to run\n\n${SCRIPT_USAGE}`);
  const scriptFile = path.resolve(file);
  if (!fs.existsSync(scriptFile)) throw new Error(`No script at ${scriptFile}`);

  // A script writes unless it says it only reads, so it's refused while an app runs on the data dir
  const db = await openTarget(target, { write: !values['read-only'], command: 'script' }, io);
  const result = await withDatabase(db, async () => {
    const module = await importScript(scriptFile);
    if (typeof module.default !== 'function') {
      throw new Error(`${scriptFile} exports no function to run: export default ({ db, EARS, args, log }) => { ... }`);
    }
    const context: DbScriptContext = { db, EARS: consoleScope(db).EARS, args: scriptArgs, log: io.out };
    return (module.default as (context: DbScriptContext) => unknown)(context);
  });
  if (result !== undefined) writeResult(result, { format, out: values.out as string | undefined }, io);
}
