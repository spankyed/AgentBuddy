// abuddy db: the app's database, opened offline (@abuddy/host/database)
import { CLEAR_SETTINGS_USAGE, dbClearSettings, dbImport, dbReset, IMPORT_USAGE, RESET_USAGE } from './destructive';
import { dbExec, dbQuery, EXEC_USAGE, QUERY_USAGE } from './code';
import { dbExport, EXPORT_USAGE } from './export';
import { dbInspect, INSPECT_USAGE } from './inspect';
import { dbRepl, REPL_USAGE } from './repl';
import { processIo, TARGET_USAGE, type DbIo } from './target';

const COMMANDS: Record<string, { run: (args: string[], io: DbIo) => Promise<void>; usage: string }> = {
  query: { run: dbQuery, usage: QUERY_USAGE },
  exec: { run: dbExec, usage: EXEC_USAGE },
  repl: { run: dbRepl, usage: REPL_USAGE },
  inspect: { run: dbInspect, usage: INSPECT_USAGE },
  export: { run: dbExport, usage: EXPORT_USAGE },
  import: { run: dbImport, usage: IMPORT_USAGE },
  reset: { run: dbReset, usage: RESET_USAGE },
  'clear-settings': { run: dbClearSettings, usage: CLEAR_SETTINGS_USAGE },
};

export const DB_USAGE = `
Usage: abuddy db <command> [options]

The app's database, read and changed while AgentBuddy is closed. Commands that change it refuse while AgentBuddy runs
on the data dir; reads warn that they may miss what it hasn't written yet. Data another AgentBuddy version (major.minor)
migrated is refused.

Commands:
  query <code>          Run read-only query code (the Database console's)
  exec <code>           Run transaction code
  repl [--write]        Run console code line by line
  inspect [<id>]        An entity's relations, or relation counts per entity type
  export --out <dir>    Each entity type's entities to a file
  import <backup-dir>   Replace the database with a backup (lists the change; --force makes it)
  reset                 Delete all data, as Reset Database does (lists it; --force deletes)
  clear-settings        Destroy the Settings rows, so defaults come back (lists them; --force destroys)

Every command takes:
${TARGET_USAGE}

abuddy db <command> --help shows a command's options.
`.trim();

export async function db(args: string[], io: DbIo = processIo): Promise<void> {
  const [command, ...rest] = args;
  if (!command || command === '--help' || command === '-h') {
    io.out(DB_USAGE);
    return;
  }
  const entry = COMMANDS[command];
  if (!entry) throw new Error(`Unknown db command: ${command}\n\n${DB_USAGE}`);
  if (rest.includes('--help') || rest.includes('-h')) {
    io.out(entry.usage);
    return;
  }
  await entry.run(rest, io);
}
