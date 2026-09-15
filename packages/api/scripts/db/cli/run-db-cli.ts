#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { pathToFileURL } from 'node:url';
import { openDatabase, closeDatabase } from '../database';
import { DatabaseCLI, type CliOptions } from './db-cli';

const cliOptions = {
  exec: { type: 'string', short: 'e' },
  script: { type: 'string', short: 's' },
  output: { type: 'string', short: 'o', default: 'pretty' },
  'output-file': { type: 'string', short: 'f' },
  'no-confirm': { type: 'boolean', default: false },
  verbose: { type: 'boolean', short: 'v', default: false },
  help: { type: 'boolean', short: 'h', default: false },
} satisfies ParseArgsConfig['options'];

/**
 * Splits the CLI's arguments at the script path: options up to and including `-s, --script <path>`
 * are the CLI's, everything after it belongs to the script (one leading `--` dropped), so a
 * script's own flags (`-e`, `-o`, ...) never reach the CLI's parser.
 */
export function splitDbCliArgs(argv: string[]): { cliArgs: string[]; scriptArgs: string[] } {
  const { tokens } = parseArgs({ args: argv, options: cliOptions, strict: false, allowPositionals: true, tokens: true });
  const script = tokens.find((token) => token.kind === 'option' && token.name === 'script');
  if (!script || script.kind !== 'option') return { cliArgs: argv, scriptArgs: [] };
  const cut = script.index + (script.inlineValue ? 1 : 2);
  const scriptArgs = argv.slice(cut);
  return { cliArgs: argv.slice(0, cut), scriptArgs: scriptArgs[0] === '--' ? scriptArgs.slice(1) : scriptArgs };
}

async function main() {
  const { cliArgs, scriptArgs } = splitDbCliArgs(process.argv.slice(2));
  const { values, positionals } = parseArgs({
    args: cliArgs,
    options: cliOptions,
    strict: false,
    allowPositionals: true
  });

  // Show help
  if (values.help) {
    showHelp();
    process.exit(0);
  }

  try {
    // Initialize database
    console.log('🔄 Initializing database...');
    await initializeDatabase(values.verbose as boolean);
    console.log('✅ Database initialized\n');

    // Determine mode and options
    const options: CliOptions = {
      mode: 'interactive',
      output: values.output as 'json' | 'csv' | 'pretty',
      outputFile: values['output-file'] as string,
      confirm: !values['no-confirm'],
      verbose: values.verbose as boolean
    };

    if (values.exec) {
      options.mode = 'exec';
      options.command = values.exec as string;
    } else if (values.script) {
      options.mode = 'script';
      options.scriptPath = values.script as string;
      options.scriptArgs = scriptArgs;
    } else if (positionals.length > 0) {
      // If positional argument provided, treat as command
      options.mode = 'exec';
      options.command = positionals.join(' ');
    }

    // Start CLI
    const cli = new DatabaseCLI(options);
    await cli.start();
    
    // Clean exit for non-interactive modes
    if (options.mode !== 'interactive') {
      cleanup();
      process.exit(0);
    }

  } catch (error) {
    console.error('Fatal error:', error);
    cleanup();
    process.exit(1);
  }
}

async function initializeDatabase(verbose: boolean) {
  try {
    if (verbose) {
      console.log('  - Registering built-in packs and hydrating from LMDB...');
    }

    await openDatabase();
    
    if (verbose) {
      console.log('  - Database ready');
    }
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

let cleanupDone = false;

function cleanup() {
  if (cleanupDone) return;
  cleanupDone = true;
  
  try {
    console.log('\n🔄 Closing database...');
    closeDatabase();
    console.log('✅ Database closed');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

function showHelp() {
  console.log(`
🗄️  AgentBuddy Database CLI

Usage:
  db-cli [options] [command]

Options:
  -e, --exec <command>      Execute a command and exit
  -s, --script <path> [args...]
                            Execute a script file; arguments after the path go to the script
  -o, --output <format>     Output format: json, csv, pretty (default: pretty)
  -f, --output-file <path>  Save output to file
  --no-confirm              Skip confirmation for destructive operations
  -v, --verbose             Verbose output
  -h, --help                Show this help

Examples:
  # Interactive mode
  db-cli

  # Execute a command
  db-cli -e "qx(EARS.Entity.Settings).pickAll()"
  db-cli --exec "qx().ofType(EARS.Entity.Document).count()"

  # Execute with output to file
  db-cli -e "qx(EARS.Entity.Agent).pickAll()" -o json -f agents.json

  # Execute a script
  db-cli -s ./scripts/cleanup.js
  db-cli -s scripts/db/export-data.ts -e Settings --format csv

  # One-liner without quotes
  db-cli qx\\(EARS.Entity.Settings\\).count\\(\\)

  # Destructive operation with confirmation
  db-cli -e "qx(EARS.Entity.Settings).ids().forEach(id => tx(id).destroy())"

  # Skip confirmation
  db-cli --no-confirm -e "tx('Settings-123').destroy()"

Interactive Commands:
  qx()        Query builder
  tx()        Transaction builder
  EARS        Entity/Attribute/Relation types
  .help       Show help
  .stats      Show database statistics
  .export     Export last result
  .clear      Clear screen
  .exit       Exit CLI
  `);
}

// Run as a script (the spec imports splitDbCliArgs)
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { initializeDatabase, cleanup };