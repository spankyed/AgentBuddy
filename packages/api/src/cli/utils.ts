import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { inspect } from 'node:util';
import { EARS } from '@/core/types';

/**
 * Format result for console output
 */
export function formatResult(result: any): string {
  // Handle null/undefined
  if (result === null) return 'null';
  if (result === undefined) return 'undefined';

  // Handle primitives
  if (typeof result !== 'object') {
    return String(result);
  }

  // Handle arrays
  if (Array.isArray(result)) {
    if (result.length === 0) return '[]';
    
    // Check if array of entities
    if (result.length > 0 && typeof result[0] === 'object' && 'id' in result[0]) {
      return formatEntityArray(result);
    }
    
    // Check if array of IDs
    if (result.length > 0 && typeof result[0] === 'string' && result[0].includes('-')) {
      return formatIdArray(result);
    }
    
    return inspect(result, { 
      colors: true, 
      depth: 4, 
      maxArrayLength: 100,
      compact: false 
    });
  }

  // Handle single entity
  if ('id' in result) {
    return formatEntity(result);
  }

  // Default inspect
  return inspect(result, { 
    colors: true, 
    depth: 4, 
    compact: false 
  });
}

/**
 * Format an array of entities
 */
function formatEntityArray(entities: any[]): string {
  const lines: string[] = [];
  lines.push(`\n📦 ${entities.length} entities found:\n`);
  lines.push('─'.repeat(60));
  
  entities.forEach((entity, index) => {
    const type = entity.id ? entity.id.split('-')[0] : 'Unknown';
    const preview = getEntityPreview(entity);
    lines.push(`  ${index + 1}. [${type}] ${entity.id || 'no-id'}`);
    if (preview) {
      lines.push(`     ${preview}`);
    }
  });
  
  return lines.join('\n');
}

/**
 * Format an array of entity IDs
 */
function formatIdArray(ids: string[]): string {
  const lines: string[] = [];
  lines.push(`\n📋 ${ids.length} IDs found:\n`);
  
  // Group by entity type
  const grouped: Record<string, string[]> = {};
  ids.forEach(id => {
    const type = id.split('-')[0];
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(id);
  });
  
  Object.entries(grouped).forEach(([type, typeIds]) => {
    lines.push(`  ${type} (${typeIds.length}):`);
    typeIds.slice(0, 5).forEach(id => {
      lines.push(`    - ${id}`);
    });
    if (typeIds.length > 5) {
      lines.push(`    ... and ${typeIds.length - 5} more`);
    }
  });
  
  return lines.join('\n');
}

/**
 * Format a single entity
 */
function formatEntity(entity: any): string {
  const lines: string[] = [];
  const type = entity.id ? entity.id.split('-')[0] : 'Unknown';
  
  lines.push(`\n🔍 Entity: ${entity.id || 'no-id'}`);
  lines.push(`   Type: ${type}`);
  lines.push('─'.repeat(40));
  
  // Format attributes
  const attrs = { ...entity };
  delete attrs.id;
  
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    
    const formatted = formatValue(value);
    lines.push(`  ${key}: ${formatted}`);
  });
  
  return lines.join('\n');
}

/**
 * Get a preview of an entity for list display
 */
function getEntityPreview(entity: any): string {
  const previewFields = ['name', 'title', 'content', 'value', 'message', 'text'];
  
  for (const field of previewFields) {
    if (entity[field]) {
      const value = String(entity[field]);
      if (value.length > 50) {
        return value.substring(0, 50) + '...';
      }
      return value;
    }
  }
  
  // Show first non-id field
  const keys = Object.keys(entity).filter(k => k !== 'id');
  if (keys.length > 0) {
    const value = String(entity[keys[0]]);
    if (value.length > 50) {
      return `${keys[0]}: ${value.substring(0, 50)}...`;
    }
    return `${keys[0]}: ${value}`;
  }
  
  return '';
}

/**
 * Format a value for display
 */
function formatValue(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.length > 3) {
      return `[${value.slice(0, 3).map(v => formatValue(v)).join(', ')}, ... (${value.length} items)]`;
    }
    return `[${value.map(v => formatValue(v)).join(', ')}]`;
  }
  
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    if (keys.length > 3) {
      return `{ ${keys.slice(0, 3).join(', ')}, ... (${keys.length} keys) }`;
    }
    return `{ ${keys.join(', ')} }`;
  }
  
  if (typeof value === 'string' && value.length > 100) {
    return value.substring(0, 100) + '...';
  }
  
  return String(value);
}

/**
 * Export data to JSON file
 */
export async function exportToJSON(data: any, filepath: string): Promise<void> {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(filepath, json, 'utf-8');
}

/**
 * Export data to CSV file
 */
export async function exportToCSV(data: any, filepath: string): Promise<void> {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  let csv = '';
  
  // Handle array of objects
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
    // Get all unique keys
    const keys = new Set<string>();
    data.forEach(item => {
      if (item && typeof item === 'object') {
        Object.keys(item).forEach(key => keys.add(key));
      }
    });
    
    const headers = Array.from(keys);
    csv = headers.map(escapeCSV).join(',') + '\n';
    
    // Add rows
    data.forEach(item => {
      const row = headers.map(key => {
        const value = item[key];
        return escapeCSV(value);
      });
      csv += row.join(',') + '\n';
    });
  } 
  // Handle single object
  else if (typeof data === 'object' && !Array.isArray(data)) {
    const keys = Object.keys(data);
    csv = keys.map(escapeCSV).join(',') + '\n';
    csv += keys.map(key => escapeCSV(data[key])).join(',') + '\n';
  }
  // Handle primitives
  else {
    csv = escapeCSV(data);
  }
  
  fs.writeFileSync(filepath, csv, 'utf-8');
}

/**
 * Escape value for CSV
 */
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

/**
 * Confirm destructive action
 */
export async function confirmAction(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(`⚠️  ${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Parse a command string to extract entity types and operations
 */
export function parseCommand(command: string): {
  entities: EARS.Entity[];
  operations: string[];
  isDestructive: boolean;
} {
  const entities: EARS.Entity[] = [];
  const operations: string[] = [];
  let isDestructive = false;
  
  // Extract entity types
  for (const entity of Object.values(EARS.Entity)) {
    if (command.includes(entity)) {
      entities.push(entity);
    }
  }
  
  // Extract operations
  const operationPatterns = [
    /\.(\w+)\(/g,  // Method calls
    /^(\w+)\(/g,   // Function calls
  ];
  
  for (const pattern of operationPatterns) {
    let match;
    while ((match = pattern.exec(command)) !== null) {
      operations.push(match[1]);
    }
  }
  
  // Check if destructive
  const destructiveOps = [
    'destroy', 'drop', 'revoke', 'unlink', 'clear', 
    'remove', 'delete', 'purge', 'reset'
  ];
  
  isDestructive = operations.some(op => 
    destructiveOps.some(d => op.toLowerCase().includes(d))
  );
  
  return { entities, operations, isDestructive };
}

/**
 * Create a progress indicator for long operations
 */
export class ProgressIndicator {
  private interval?: NodeJS.Timeout;
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private current = 0;
  
  start(message: string) {
    this.stop();
    this.current = 0;
    this.interval = setInterval(() => {
      process.stdout.write(`\r${this.frames[this.current]} ${message}`);
      this.current = (this.current + 1) % this.frames.length;
    }, 80);
  }
  
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
    }
  }
  
  success(message: string) {
    this.stop();
    console.log(`✅ ${message}`);
  }
  
  error(message: string) {
    this.stop();
    console.log(`❌ ${message}`);
  }
}