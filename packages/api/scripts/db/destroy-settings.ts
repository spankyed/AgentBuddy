#!/usr/bin/env tsx
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
import { EARS } from '@/core/types';
// ! broken
console.log('🗑️  Settings Destroyer');
console.log('─'.repeat(50));

const settingsIds = qx(EARS.Entity.Settings).ids();
console.log(`\nDestroying ${settingsIds.length} settings...`);

settingsIds.forEach(id => tx(id).destroy());

console.log(`✅ Destroyed ${settingsIds.length} settings`);
console.log('─'.repeat(50));