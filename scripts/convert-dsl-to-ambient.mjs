#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const typesDir = path.join(projectRoot, 'packages/renderer/src/core/types');

// All DSL files to convert
const dslFiles = [
  'database-dsl.d.ts',
  'action-dsl.d.ts',
  'prompt-dsl.d.ts'
];

/**
 * Convert ES module exports to ambient declarations for Monaco
 */
function convertToAmbient(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`⏭️  Skipping ${path.basename(filePath)} (not found)`);
    return;
  }
  
  // Read the generated file
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Remove all import statements to make it ambient
  content = content.replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '');
  content = content.replace(/^import\s+['"].*?['"];?\s*$/gm, '');
  content = content.replace(/^import\s+type\s+.*?from\s+['"].*?['"];?\s*$/gm, '');
  
  // Remove top-level export keywords (but keep 'export as namespace' and 'export declare global')
  content = content.replace(/^export\s+(?!(declare global|as namespace))/gm, '');
  
  // Remove any standalone 'as namespace' that lost their 'export' prefix (fixing broken syntax)
  // But keep 'export as namespace' intact
  content = content.replace(/^(?<!export\s)as\s+namespace\s+\w+;?\s*$/gm, '');
  
  // Remove export blocks with named exports - multiline version
  content = content.replace(/^export\s*\{[\s\S]*?\n\};?\s*$/gm, '');
  
  // Remove any standalone 'export {}' statements
  content = content.replace(/^export\s*\{\s*\}\s*;?\s*$/gm, '');
  
  // Clean up any remaining standalone braces and semicolons
  content = content.replace(/^\{\s*[\w$]+\s+as\s+\w+,?\s*\};?\s*$/gm, '');
  content = content.replace(/^\{\s*\};?\s*$/gm, '');
  
  // Remove empty lines at the beginning (cleanup after removing imports)
  content = content.replace(/^(\s*\n)+/, '');
  
  // Replace any remaining import() type references with any
  // e.g., import("ai").StreamTextResult becomes any
  content = content.replace(/import\(['"].*?['"]\)\.\w+(\<.*?\>)?/g, 'any');
  
  // Clean up multiple consecutive empty lines
  content = content.replace(/\n{3,}/g, '\n\n');
  
  // Write the modified content back
  fs.writeFileSync(filePath, content, 'utf-8');
  
  console.log(`✅ Converted ${path.basename(filePath)} to ambient declarations`);
}

// Convert all DSL files
console.log('🔄 Converting DSL types to ambient declarations...');
dslFiles.forEach(file => {
  const filePath = path.join(typesDir, file);
  convertToAmbient(filePath);
});
console.log('✨ All DSL types converted successfully');