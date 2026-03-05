#!/usr/bin/env tsx
/**
 * CLI script for importing database backups
 *
 * Usage:
 *   npm run db:import -- --path /path/to/backup
 *   npm run db:import -- --path /path/to/backup --force
 */

import * as fs from 'fs-extra';
import * as path from 'node:path';
import { importDatabase, getBackupInfo } from '@/systems/database/backup';
import { clearMemory, envs, policy, persistence } from '@/core/ears/attribute-storage';
import { hydrateSharded } from '@/persistence/partitioning/hydrate-sharded';
import { createLogger } from '@/core/helpers/debug/logger';
import readline from 'readline';

const logger = createLogger('import-backup');

interface ImportOptions {
  path: string;
  force: boolean;
  verbose: boolean;
}

function parseArgs(): ImportOptions {
  const args = process.argv.slice(2);
  const options: ImportOptions = {
    path: '',
    force: false,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--path':
      case '-p':
        options.path = args[++i] || '';
        break;
      case '--force':
      case '-f':
        options.force = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
    }
  }

  return options;
}

function showHelp() {
  console.log(`
📦 AgentBuddy Backup Import Tool

Usage:
  npm run db:import -- --path <backup-path> [options]

Options:
  --path, -p     Path to the backup directory (required)
  --force, -f    Skip confirmation prompt
  --verbose, -v  Show detailed output
  --help, -h     Show this help message

Examples:
  npm run db:import -- --path ./backups/agentbuddy-backup-2024-01-01
  npm run db:import -- --path /Users/me/backup --force

Note: This will replace your current database with the backup.
Make sure to export your current data first if needed.
`);
}

async function promptConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function runImport() {
  const options = parseArgs();

  // Validate path argument
  if (!options.path) {
    console.error('❌ Error: Backup path is required');
    console.log('Use --help for usage information');
    process.exit(1);
  }

  // Check if backup path exists
  if (!await fs.pathExists(options.path)) {
    console.error(`❌ Error: Backup path does not exist: ${options.path}`);
    process.exit(1);
  }

  // Check if it's a valid backup
  const metadataPath = path.join(options.path, 'metadata.json');
  if (!await fs.pathExists(metadataPath)) {
    console.error('❌ Error: Invalid backup - metadata.json not found');
    console.error(`  Path: ${options.path}`);
    process.exit(1);
  }

  console.log('📦 AgentBuddy Backup Import\n');
  console.log('─'.repeat(50));

  try {
    // Get backup info
    const info = await getBackupInfo(options.path);
    if (!info) {
      console.error('❌ Error: Could not read backup information');
      process.exit(1);
    }

    // Display backup details
    console.log('📋 Backup Information:');
    console.log(`  Path: ${options.path}`);
    console.log(`  Created: ${new Date(info.timestamp).toLocaleString()}`);
    console.log(`  Size: ${formatBytes(info.size)}`);
    console.log(`  Databases: ${info.databases.join(', ')}`);
    console.log('─'.repeat(50));

    // Confirm import unless force flag is set
    if (!options.force) {
      console.log('\n⚠️  WARNING: This will replace your current database!');
      console.log('   Make sure you have exported your current data if needed.\n');

      const confirmed = await promptConfirmation('Do you want to proceed with the import?');
      if (!confirmed) {
        console.log('\n❌ Import cancelled by user');
        process.exit(0);
      }
    }

    console.log('\n🔄 Starting import...\n');

    // Perform the import
    const result = await importDatabase(options.path);

    if (options.verbose) {
      console.log('✅ Database files imported successfully');
      console.log(`   Imported databases: ${result.databases.join(', ')}`);
    }

    // Clear and rehydrate memory
    console.log('🔄 Rehydrating memory from imported databases...');
    clearMemory();
    await hydrateSharded({
      envs,
      policy,
      includeVolatile: result.databases.includes('volatileLmdb'),
      shardedPersistence: persistence
    });

    console.log('─'.repeat(50));
    console.log('\n✅ Import completed successfully!');
    console.log('\n📝 Note: If the application is running, you may need to restart it');
    console.log('   for all changes to take effect properly.\n');

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Import failed:', errorMessage);

    if (options.verbose && error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }

    console.error('\n📝 Your original database has been restored if possible.');
    process.exit(1);
  }
}

// Run the import
runImport().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});