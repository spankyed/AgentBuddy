#!/usr/bin/env tsx
/**
 * Example script: Export entities to JSON files
 * 
 * Usage:
 *   npm run db:script scripts/db/export-data.ts
 *   npm run db:script scripts/db/export-data.ts -- --output ./backup
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { qx } from '@/core/ears/helpers/query';
import { EARS } from '@/core/types';
import { getAllEntities, getEntitiesOfType } from '@/core/ears/attribute-storage';

interface ExportOptions {
  outputDir: string;
  entities?: EARS.Entity[];
  format: 'json' | 'csv';
  verbose: boolean;
}

function parseArgs(): ExportOptions {
  const args = process.argv.slice(2);
  const options: ExportOptions = {
    outputDir: './exports',
    format: 'json',
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--output':
      case '-o':
        options.outputDir = args[++i] || './exports';
        break;
      case '--entities':
      case '-e':
        const entities = args[++i];
        if (entities) {
          options.entities = entities.split(',') as EARS.Entity[];
        }
        break;
      case '--format':
      case '-f':
        options.format = (args[++i] || 'json') as 'json' | 'csv';
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
    }
  }

  return options;
}

async function exportData() {
  const options = parseArgs();
  
  console.log('📦 Starting data export...\n');
  console.log(`  Output directory: ${options.outputDir}`);
  console.log(`  Format: ${options.format}`);
  
  // Create output directory
  if (!fs.existsSync(options.outputDir)) {
    fs.mkdirSync(options.outputDir, { recursive: true });
  }

  // Get entity types to export
  const entityTypes = options.entities || Object.values(EARS.Entity);
  console.log(`  Entity types: ${entityTypes.length}\n`);

  const summary: Record<string, number> = {};
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Export each entity type
  for (const entityType of entityTypes) {
    if (options.verbose) {
      process.stdout.write(`Exporting ${entityType}...`);
    }

    try {
      // Get all entities of this type
      const entities = qx(entityType).pickAll();
      
      if (entities.length === 0) {
        if (options.verbose) {
          process.stdout.write(` ⏭️  No entities found\n`);
        }
        continue;
      }

      // Create filename
      const filename = `${entityType.toLowerCase()}-${timestamp}.${options.format}`;
      const filepath = path.join(options.outputDir, filename);

      // Export based on format
      if (options.format === 'csv') {
        await exportToCSV(entities, filepath);
      } else {
        await exportToJSON(entities, filepath);
      }

      summary[entityType] = entities.length;
      
      if (options.verbose) {
        process.stdout.write(` ✅ ${entities.length} entities\n`);
      }
    } catch (error) {
      if (options.verbose) {
        process.stdout.write(` ❌ Error: ${error}\n`);
      }
      summary[entityType] = 0;
    }
  }

  // Export metadata
  const metadata = {
    timestamp: new Date().toISOString(),
    totalEntities: getAllEntities().length,
    exportedTypes: summary,
    format: options.format
  };

  const metaPath = path.join(options.outputDir, `export-metadata-${timestamp}.json`);
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

  // Print summary
  console.log('\n📊 Export Summary:');
  console.log('─'.repeat(40));
  
  let totalExported = 0;
  Object.entries(summary).forEach(([type, count]) => {
    if (count > 0) {
      console.log(`  ${type}: ${count} entities`);
      totalExported += count;
    }
  });
  
  console.log('─'.repeat(40));
  console.log(`  Total: ${totalExported} entities exported`);
  console.log(`\n✅ Export complete! Files saved to: ${options.outputDir}`);
}

async function exportToJSON(data: any[], filepath: string): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(filepath, json, 'utf-8');
}

async function exportToCSV(data: any[], filepath: string): Promise<void> {
  if (data.length === 0) return;
  
  // Get all unique keys
  const keys = new Set<string>();
  data.forEach(item => {
    Object.keys(item).forEach(key => keys.add(key));
  });
  
  const headers = Array.from(keys);
  let csv = headers.map(escapeCSV).join(',') + '\n';
  
  // Add rows
  data.forEach(item => {
    const row = headers.map(key => {
      const value = item[key];
      return escapeCSV(value);
    });
    csv += row.join(',') + '\n';
  });
  
  fs.writeFileSync(filepath, csv, 'utf-8');
}

function escapeCSV(value: any): string {
  if (value === null || value === undefined) return '';
  
  let str = String(value);
  
  // Handle objects and arrays
  if (typeof value === 'object') {
    str = JSON.stringify(value);
  }
  
  // Escape if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    str = '"' + str.replace(/"/g, '""') + '"';
  }
  
  return str;
}

// Run the export
exportData().catch(error => {
  console.error('❌ Export failed:', error);
  process.exit(1);
});