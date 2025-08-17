#!/usr/bin/env node

import { Project, ScriptTarget, ModuleKind, Node, SyntaxKind } from 'ts-morph';
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
 * Convert ES module exports to ambient declarations using ts-morph
 */
function convertToAmbientWithAst(filePath) {
  const fileName = path.basename(filePath);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⏭️  Skipping ${fileName} (not found)`);
    return;
  }

  console.log(`🔧 Processing ${fileName}...`);

  // Create project with proper enum values for compiler options
  const project = new Project({
    compilerOptions: {
      declaration: true,
      module: ModuleKind.ESNext,
      target: ScriptTarget.ES2022,
      lib: ['lib.es2022.d.ts'],
      skipLibCheck: true,
      allowJs: true,
      types: [], // Don't automatically include @types
    },
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  const sourceFile = project.addSourceFileAtPath(filePath);
  
  // Collect transformations to apply
  const transformations = [];
  
  // Step 1: Collect import() type node replacements
  // We need to handle these carefully to avoid parent-child conflicts
  const importTypeNodes = [];
  sourceFile.forEachDescendant((node) => {
    if (Node.isImportTypeNode(node)) {
      // Check if this is part of a qualified name (import("...").Something)
      const parent = node.getParent();
      if (parent && Node.isQualifiedName(parent)) {
        // Replace the entire qualified name
        importTypeNodes.push({
          node: parent,
          type: 'qualified',
          text: parent.getText()
        });
      } else {
        // Just the import type itself
        importTypeNodes.push({
          node: node,
          type: 'simple',
          text: node.getText()
        });
      }
    }
  });
  
  // Sort by depth (deepest first) to avoid parent-child conflicts
  importTypeNodes.sort((a, b) => {
    const depthA = a.node.getAncestors().length;
    const depthB = b.node.getAncestors().length;
    return depthB - depthA;
  });
  
  // Apply import type replacements
  const processedNodes = new Set();
  importTypeNodes.forEach(({ node, type, text }) => {
    try {
      // Skip if a parent node was already processed
      if (node.getAncestors().some(ancestor => processedNodes.has(ancestor))) {
        return;
      }
      
      node.replaceWithText('any');
      processedNodes.add(node);
      console.log(`  ✓ Replaced import type: ${text.substring(0, 50)}...`);
    } catch (e) {
      console.log(`  ⚠️  Could not replace import type: ${text.substring(0, 50)}... (${e.message})`);
    }
  });
  
  // Step 2: Remove import declarations
  const imports = sourceFile.getImportDeclarations();
  imports.forEach((imp) => {
    try {
      const text = imp.getText();
      imp.remove();
      console.log(`  ✓ Removed import: ${text.substring(0, 50)}...`);
    } catch (e) {
      console.log(`  ⚠️  Could not remove import: ${e.message}`);
    }
  });

  // Step 3: Handle export declarations
  const exportDeclarations = sourceFile.getExportDeclarations();
  exportDeclarations.forEach((exp) => {
    try {
      const text = exp.getText();
      // Keep 'export as namespace' declarations
      if (text.includes('export as namespace')) {
        console.log(`  ✓ Keeping: ${text}`);
        return;
      }
      // Remove other export declarations
      exp.remove();
      console.log(`  ✓ Removed export declaration: ${text.substring(0, 50)}...`);
    } catch (e) {
      console.log(`  ⚠️  Could not process export declaration: ${e.message}`);
    }
  });

  // Step 4: Remove export keywords from various node types
  const removeExportFromNode = (node, nodeType) => {
    try {
      if (node.isExported && node.isExported()) {
        const name = node.getName ? node.getName() : 'unnamed';
        
        // Special handling for 'export declare global' blocks
        if (nodeType === 'module' && node.getText().includes('declare global')) {
          console.log(`  ✓ Keeping export for declare global block`);
          return;
        }
        
        node.setIsExported(false);
        console.log(`  ✓ Removed export from ${nodeType}: ${name}`);
      }
    } catch (e) {
      console.log(`  ⚠️  Could not remove export from ${nodeType}: ${e.message}`);
    }
  };

  // Process different node types
  sourceFile.getFunctions().forEach(node => removeExportFromNode(node, 'function'));
  sourceFile.getClasses().forEach(node => removeExportFromNode(node, 'class'));
  sourceFile.getInterfaces().forEach(node => removeExportFromNode(node, 'interface'));
  sourceFile.getTypeAliases().forEach(node => removeExportFromNode(node, 'type'));
  sourceFile.getEnums().forEach(node => removeExportFromNode(node, 'enum'));
  sourceFile.getVariableStatements().forEach(node => removeExportFromNode(node, 'variable'));
  
  // Handle namespaces/modules specially
  sourceFile.getModules().forEach(ns => {
    try {
      if (ns.hasExportKeyword()) {
        const text = ns.getText();
        // Keep 'export as namespace' but remove export from regular namespaces
        if (!text.includes('export as namespace') && !text.includes('declare global')) {
          ns.setIsExported(false);
          console.log(`  ✓ Removed export from namespace`);
        }
      }
    } catch (e) {
      console.log(`  ⚠️  Could not process namespace: ${e.message}`);
    }
  });

  // Step 5: Remove standalone export statements
  const statements = sourceFile.getStatements();
  const toRemove = [];
  
  statements.forEach(stmt => {
    try {
      const text = stmt.getText().trim();
      
      // Preserve 'export as namespace' statements
      if (text.startsWith('export as namespace')) {
        console.log(`  ✓ Keeping: ${text}`);
        return;
      }
      
      // Preserve 'export declare global' blocks
      if (text.startsWith('export declare global')) {
        console.log(`  ✓ Keeping: export declare global block`);
        return;
      }
      
      // Remove standalone export statements and empty exports
      if (text === 'export {}' || 
          text === 'export {};' || 
          text.match(/^export\s*\{[\s\S]*?\};?$/)) {
        toRemove.push(stmt);
      }
    } catch (e) {
      console.log(`  ⚠️  Could not process statement: ${e.message}`);
    }
  });
  
  // Remove collected statements
  toRemove.forEach(stmt => {
    try {
      const text = stmt.getText().substring(0, 50);
      stmt.remove();
      console.log(`  ✓ Removed statement: ${text}...`);
    } catch (e) {
      console.log(`  ⚠️  Could not remove statement: ${e.message}`);
    }
  });

  // Save the transformed file
  try {
    sourceFile.saveSync();
    console.log(`✅ Successfully converted ${fileName} to ambient declarations`);
  } catch (e) {
    console.error(`❌ Failed to save ${fileName}: ${e.message}`);
    throw e;
  }
}

// Main execution
console.log('🔄 Converting DSL types to ambient declarations using ts-morph...\n');

let successCount = 0;
let failCount = 0;

dslFiles.forEach(file => {
  const filePath = path.join(typesDir, file);
  try {
    convertToAmbientWithAst(filePath);
    successCount++;
    console.log(''); // Add spacing between files
  } catch (error) {
    console.error(`❌ Error converting ${file}:`, error.message);
    failCount++;
    console.log('');
  }
});

// Summary
console.log('═'.repeat(60));
if (failCount === 0) {
  console.log(`✨ All ${successCount} DSL types converted successfully!`);
} else {
  console.log(`⚠️  Converted ${successCount} files, ${failCount} failed`);
  process.exit(1);
}