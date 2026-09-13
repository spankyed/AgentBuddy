#!/usr/bin/env tsx
import { tx } from '@abuddy/sdk/ears';
import { qx } from '@abuddy/sdk/ears/internals';
import { EARS } from '@/core/types';
// ! broken
console.log('🗑️  Settings Destroyer');
console.log('─'.repeat(50));

const settingsIds = qx(EARS.Entity.Settings).ids();
console.log(`\nDestroying ${settingsIds.length} settings...`);

settingsIds.forEach(id => tx(id).destroy());

console.log(`✅ Destroyed ${settingsIds.length} settings`);
console.log('─'.repeat(50));