#!/usr/bin/env node
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { DatabaseCLI, type CliOptions } from './db-cli';
import { hydrateSharded } from '@/persistence/partitioning/hydrate-sharded';
import { envs, policy, persistence, closePersistence } from '@/core/utils/ears/attribute-storage';
import { createDefaultSettings } from '@/systems/settings/repository';

async function main() {
  // Parse command line arguments
  const { values, positionals } = parseArgs({
    options: {
      exec: {
        type: 'string',
        short: 'e',
        default: undefined
      },
      script: {
        type: 'string',
        short: 's',
        default: undefined
      },
      output: {
        type: 'string',
        short: 'o',
        default: 'pretty'
      },
      'output-file': {
        type: 'string',
        short: 'f',
        default: undefined
      },
      'no-confirm': {
        type: 'boolean',
        default: false
      },
      verbose: {
        type: 'boolean',
        short: 'v',
        default: false
      },
      help: {
        type: 'boolean',
        short: 'h',
        default: false
      }
    },
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
    // Hydrate from LMDB using sharded approach
    if (verbose) {
      console.log('  - Hydrating from LMDB...');
    }
    
    await hydrateSharded({ 
      envs, 
      policy, 
      shardedPersistence: persistence 
    });
    
    if (verbose) {
      console.log('  - Creating default settings...');
    }
    
    // Initialize default settings if they don't exist
    createDefaultSettings();
    
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
    closePersistence();
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
  -s, --script <path>       Execute a script file
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

// Run if executed directly
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { initializeDatabase, cleanup };