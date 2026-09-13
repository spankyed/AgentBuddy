#!/usr/bin/env tsx
/**
 * Destroys every Settings entity; the app recreates defaults on its next start.
 *
 * Usage:
 *   npm run db:clearSettings
 */
import { tx } from '@abuddy/sdk/ears';
import { qx } from '@abuddy/host/ears';
import { openDatabase, closeDatabase, entity } from './database';

async function run() {
  await openDatabase();
  console.log('🗑️  Settings Destroyer');
  console.log('─'.repeat(50));

  const settingsIds = qx(entity('Settings')).ids();
  console.log(`\nDestroying ${settingsIds.length} settings...`);
  settingsIds.forEach(id => tx(id).destroy());

  console.log(`✅ Destroyed ${settingsIds.length} settings`);
  console.log('─'.repeat(50));
  closeDatabase();
}

run().catch(err => {
  console.error('Destroy failed:', err);
  process.exit(1);
});
