#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const outputPath = path.join(projectRoot, 'packages/renderer/src/core/types/database-dsl.d.ts');

/**
 * Convert ES module exports to ambient declarations for Monaco
 */
function convertToAmbient() {
  console.log('🔄 Converting to ambient declarations...');
  
  // Read the generated file
  let content = fs.readFileSync(outputPath, 'utf-8');
  
  // Remove top-level export keywords (but keep exports inside namespaces/interfaces)
  content = content.replace(/^export\s+/gm, '');
  
  // Remove the 'export as namespace DSL;' line
  content = content.replace(/^as\s+namespace\s+\w+;?\s*$/gm, '');
  
  // Remove any standalone 'export {}' statements
  content = content.replace(/^\s*\{\s*\}\s*;?\s*$/gm, '');
  
  // Write the modified content back
  fs.writeFileSync(outputPath, content, 'utf-8');
  
  console.log('✅ DSL types converted to ambient declarations');
}

// Just run the conversion - dts-bundle-generator is called separately
convertToAmbient();