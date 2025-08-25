#!/usr/bin/env tsx
/**
 * Script: Destroy all or specific settings entities
 * 
 * Usage:
 *   # Destroy all settings
 *   npm run db:script scripts/db/destroy-settings.ts
 *   
 *   # Destroy specific label
 *   npm run db:script scripts/db/destroy-settings.ts -- --label apiKeys
 *   
 *   # Destroy specific type
 *   npm run db:script scripts/db/destroy-settings.ts -- --type plugin
 *   
 *   # Force without confirmation
 *   npm run db:script scripts/db/destroy-settings.ts -- --force
 *   
 *   # Dry run (show what would be deleted)
 *   npm run db:script scripts/db/destroy-settings.ts -- --dry-run
 */

import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
import { EARS } from '@/core/types';
import * as readline from 'node:readline';

interface DestroyOptions {
  label?: string;
  type?: string;
  force: boolean;
  dryRun: boolean;
  verbose: boolean;
}

function parseArgs(): DestroyOptions {
  const args = process.argv.slice(2);
  const options: DestroyOptions = {
    force: false,
    dryRun: false,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--label':
      case '-l':
        options.label = args[++i];
        break;
      case '--type':
      case '-t':
        options.type = args[++i];
        break;
      case '--force':
      case '-f':
        options.force = true;
        break;
      case '--dry-run':
      case '-d':
        options.dryRun = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
    }
  }

  return options;
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function destroySettings() {
  const options = parseArgs();
  
  console.log('🗑️  Settings Destroyer');
  console.log('─'.repeat(50));

  // Build query
  let query = qx(EARS.Entity.Settings);
  
  // Apply filters
  if (options.label) {
    query = query.where('label', options.label);
    console.log(`Filter: label = "${options.label}"`);
  }
  
  if (options.type) {
    query = query.where('type', options.type);
    console.log(`Filter: type = "${options.type}"`);
  }

  // Get settings to destroy
  const settings = query.pickAll();
  
  if (settings.length === 0) {
    console.log('\n✅ No settings found matching criteria');
    return;
  }

  // Display what will be deleted
  console.log(`\n📊 Found ${settings.length} settings to destroy:\n`);
  
  // Group by type and label for summary
  const summary = new Map<string, Map<string, number>>();
  
  settings.forEach(setting => {
    const type = setting.type || 'unknown';
    const label = setting.label || 'unlabeled';
    
    if (!summary.has(type)) {
      summary.set(type, new Map());
    }
    summary.get(type)!.set(
      label, 
      (summary.get(type)!.get(label) || 0) + 1
    );
    
    if (options.verbose) {
      console.log(`  - ${setting.id} (${type}/${label})`);
    }
  });

  if (!options.verbose) {
    // Show summary
    summary.forEach((labels, type) => {
      console.log(`  ${type}:`);
      labels.forEach((count, label) => {
        console.log(`    - ${label}: ${count} setting(s)`);
      });
    });
  }

  // Show some sample data that will be lost
  console.log('\n⚠️  Sample data that will be destroyed:');
  settings.slice(0, 3).forEach(setting => {
    console.log(`\n  ${setting.id}:`);
    console.log(`    Type: ${setting.type}`);
    console.log(`    Label: ${setting.label}`);
    if (setting.data) {
      const keys = Object.keys(setting.data);
      if (keys.length > 0) {
        console.log(`    Data keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`);
      }
    }
  });
  
  if (settings.length > 3) {
    console.log(`\n  ... and ${settings.length - 3} more`);
  }

  // Dry run mode
  if (options.dryRun) {
    console.log('\n📝 DRY RUN MODE - No changes will be made');
    console.log(`Would destroy ${settings.length} settings`);
    return;
  }

  // Confirmation
  console.log('\n' + '⚠️  WARNING '.repeat(5));
  console.log('This operation is IRREVERSIBLE!');
  console.log('All selected settings data will be permanently deleted.');
  console.log('⚠️  WARNING '.repeat(5) + '\n');

  if (!options.force) {
    const confirmed = await confirm(`Are you absolutely sure you want to destroy ${settings.length} settings?`);
    
    if (!confirmed) {
      console.log('❌ Operation cancelled');
      return;
    }
    
    // Double confirmation for destroying all settings
    if (!options.label && !options.type) {
      console.log('\n🚨 You are about to destroy ALL settings!');
      const doubleConfirmed = await confirm('Type "yes" to confirm deletion of ALL settings');
      
      if (!doubleConfirmed) {
        console.log('❌ Operation cancelled');
        return;
      }
    }
  }

  // Perform destruction
  console.log('\n💀 Destroying settings...');
  
  let destroyed = 0;
  let failed = 0;
  const errors: Array<{ id: string; error: any }> = [];

  for (const setting of settings) {
    try {
      tx(setting.id).destroy();
      destroyed++;
      
      if (options.verbose) {
        console.log(`  ✓ Destroyed ${setting.id}`);
      } else {
        process.stdout.write(`\r  Progress: ${destroyed}/${settings.length}`);
      }
    } catch (error) {
      failed++;
      errors.push({ id: setting.id, error });
      
      if (options.verbose) {
        console.error(`  ✗ Failed to destroy ${setting.id}:`, error);
      }
    }
  }

  // Final summary
  console.log('\n\n' + '═'.repeat(50));
  console.log('📊 Destruction Complete:');
  console.log(`  ✅ Successfully destroyed: ${destroyed} settings`);
  
  if (failed > 0) {
    console.log(`  ❌ Failed to destroy: ${failed} settings`);
    
    if (!options.verbose && errors.length > 0) {
      console.log('\nFailed IDs:');
      errors.forEach(({ id }) => {
        console.log(`  - ${id}`);
      });
    }
  }
  
  console.log('═'.repeat(50));
  
  if (destroyed > 0) {
    console.log('\n⚠️  Settings have been permanently deleted.');
    console.log('You may need to restart the application for default settings to be recreated.');
  }
}

// Run the destroyer
destroySettings().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});