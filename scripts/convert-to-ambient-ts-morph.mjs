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

// Performance tracking
let totalStats = {
  importTypes: 0,
  imports: 0,
  exports: 0,
  exportKeywords: 0,
  statements: 0
};

// Create a single project instance for better performance
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

/**
 * Convert ES module exports to ambient declarations using ts-morph
 */
function convertToAmbientWithAst(filePath) {
  const fileName = path.basename(filePath);
  const startTime = Date.now();
  
  if (!fs.existsSync(filePath)) {
    console.log(`⏭️  Skipping ${fileName} (not found)`);
    return { success: false, stats: {} };
  }

  console.log(`🔧 Processing ${fileName}...`);

  // Track statistics for this file
  const fileStats = {
    importTypes: 0,
    imports: 0,
    exports: 0,
    exportKeywords: 0,
    statements: 0,
    errors: []
  };

  const sourceFile = project.addSourceFileAtPath(filePath);
  
  try {
    // Step 1: Collect and process import() type node replacements
    const importTypeNodes = [];
    sourceFile.forEachDescendant((node) => {
      if (Node.isImportTypeNode(node)) {
        const parent = node.getParent();
        if (parent && Node.isQualifiedName(parent)) {
          importTypeNodes.push({
            node: parent,
            type: 'qualified'
          });
        } else {
          importTypeNodes.push({
            node: node,
            type: 'simple'
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
    
    // Apply import type replacements in batch
    const processedNodes = new Set();
    let replacedCount = 0;
    importTypeNodes.forEach(({ node }) => {
      try {
        if (node.getAncestors().some(ancestor => processedNodes.has(ancestor))) {
          return;
        }
        
        node.replaceWithText('any');
        processedNodes.add(node);
        replacedCount++;
      } catch (e) {
        fileStats.errors.push(`Import type replacement: ${e.message}`);
      }
    });
    
    fileStats.importTypes = replacedCount;
  
    // Step 2: Remove import declarations in batch
    const imports = sourceFile.getImportDeclarations();
    let removedImports = 0;
    imports.forEach((imp) => {
      try {
        imp.remove();
        removedImports++;
      } catch (e) {
        fileStats.errors.push(`Import removal: ${e.message}`);
      }
    });
    fileStats.imports = removedImports;

    // Step 3: Handle export declarations in batch
    const exportDeclarations = sourceFile.getExportDeclarations();
    let removedExports = 0;
    let keptExports = 0;
    exportDeclarations.forEach((exp) => {
      try {
        const text = exp.getText();
        // Keep 'export as namespace' declarations
        if (text.includes('export as namespace')) {
          keptExports++;
          return;
        }
        // Remove other export declarations
        exp.remove();
        removedExports++;
      } catch (e) {
        fileStats.errors.push(`Export declaration: ${e.message}`);
      }
    });
    fileStats.exports = removedExports;

    // Step 4: Remove export keywords from various node types in batch
    let removedExportKeywords = 0;
    
    const removeExportFromNodes = (nodes, nodeType) => {
      nodes.forEach(node => {
        try {
          if (node.isExported && node.isExported()) {
            // Special handling for 'export declare global' blocks
            if (nodeType === 'module' && node.getText().includes('declare global')) {
              return; // Keep export for declare global blocks
            }
            
            node.setIsExported(false);
            removedExportKeywords++;
          }
        } catch (e) {
          fileStats.errors.push(`Export removal from ${nodeType}: ${e.message}`);
        }
      });
    };

    // Process different node types in batch
    removeExportFromNodes(sourceFile.getFunctions(), 'function');
    removeExportFromNodes(sourceFile.getClasses(), 'class');
    removeExportFromNodes(sourceFile.getInterfaces(), 'interface');
    removeExportFromNodes(sourceFile.getTypeAliases(), 'type');
    removeExportFromNodes(sourceFile.getEnums(), 'enum');
    removeExportFromNodes(sourceFile.getVariableStatements(), 'variable');
    
    // Handle namespaces/modules specially
    sourceFile.getModules().forEach(ns => {
      try {
        if (ns.hasExportKeyword()) {
          const text = ns.getText();
          // Keep 'export as namespace' but remove export from regular namespaces
          if (!text.includes('export as namespace') && !text.includes('declare global')) {
            ns.setIsExported(false);
            removedExportKeywords++;
          }
        }
      } catch (e) {
        fileStats.errors.push(`Namespace export removal: ${e.message}`);
      }
    });
    
    fileStats.exportKeywords = removedExportKeywords;

    // Step 5: Remove standalone export statements in batch
    const statements = sourceFile.getStatements();
    const toRemove = [];
    let keptStatements = 0;
    
    statements.forEach(stmt => {
      try {
        const text = stmt.getText().trim();
        
        // Preserve 'export as namespace' statements
        if (text.startsWith('export as namespace')) {
          keptStatements++;
          return;
        }
        
        // Preserve 'export declare global' blocks
        if (text.startsWith('export declare global')) {
          keptStatements++;
          return;
        }
        
        // Remove standalone export statements and empty exports
        if (text === 'export {}' || 
            text === 'export {};' || 
            text.match(/^export\s*\{[\s\S]*?\};?$/)) {
          toRemove.push(stmt);
        }
      } catch (e) {
        fileStats.errors.push(`Statement processing: ${e.message}`);
      }
    });
    
    // Remove collected statements
    toRemove.forEach(stmt => {
      try {
        stmt.remove();
      } catch (e) {
        fileStats.errors.push(`Statement removal: ${e.message}`);
      }
    });
    fileStats.statements = toRemove.length;

    // No more cleanup needed - root cause of naming conflicts has been eliminated

    // Save the transformed file
    sourceFile.saveSync();
    
    const duration = Date.now() - startTime;
    
    // Print summary for this file
    console.log(`  ✓ Import types replaced: ${fileStats.importTypes}`);
    console.log(`  ✓ Imports removed: ${fileStats.imports}`);
    console.log(`  ✓ Export declarations removed: ${fileStats.exports}`);
    console.log(`  ✓ Export keywords removed: ${fileStats.exportKeywords}`);
    console.log(`  ✓ Statements removed: ${fileStats.statements}`);
    if (fileStats.errors.length > 0) {
      console.log(`  ⚠️  Errors: ${fileStats.errors.length}`);
    }
    console.log(`  ⏱️  Processed in ${duration}ms`);
    console.log(`✅ Successfully converted ${fileName} to ambient declarations`);
    
    // Update total stats
    totalStats.importTypes += fileStats.importTypes;
    totalStats.imports += fileStats.imports;
    totalStats.exports += fileStats.exports;
    totalStats.exportKeywords += fileStats.exportKeywords;
    totalStats.statements += fileStats.statements;
    
    return { success: true, stats: fileStats, duration };
    
  } catch (e) {
    console.error(`❌ Failed to convert ${fileName}: ${e.message}`);
    return { success: false, error: e.message, stats: fileStats };
  }
}

// Main execution
console.log('🔄 Converting DSL types to ambient declarations using ts-morph...\n');

const overallStartTime = Date.now();
let successCount = 0;
let failCount = 0;
const results = [];

dslFiles.forEach(file => {
  const filePath = path.join(typesDir, file);
  const result = convertToAmbientWithAst(filePath);
  results.push(result);
  
  if (result.success) {
    successCount++;
  } else {
    failCount++;
  }
  console.log(''); // Add spacing between files
});

const totalDuration = Date.now() - overallStartTime;

// Overall Summary
console.log('═'.repeat(80));
console.log('📊 TRANSFORMATION SUMMARY');
console.log('═'.repeat(80));
console.log(`📁 Files processed: ${dslFiles.length}`);
console.log(`✅ Successfully converted: ${successCount}`);
if (failCount > 0) {
  console.log(`❌ Failed: ${failCount}`);
}
console.log(`⏱️  Total time: ${totalDuration}ms`);
console.log('');
console.log('📈 OVERALL STATISTICS:');
console.log(`  • Import types replaced: ${totalStats.importTypes.toLocaleString()}`);
console.log(`  • Imports removed: ${totalStats.imports.toLocaleString()}`);
console.log(`  • Export declarations removed: ${totalStats.exports.toLocaleString()}`);
console.log(`  • Export keywords removed: ${totalStats.exportKeywords.toLocaleString()}`);
console.log(`  • Statements removed: ${totalStats.statements.toLocaleString()}`);

// Error details if any
const allErrors = results.filter(r => r.stats?.errors?.length > 0);
if (allErrors.length > 0) {
  console.log('\n⚠️  ERRORS ENCOUNTERED:');
  allErrors.forEach(result => {
    result.stats.errors.forEach(error => {
      console.log(`  • ${error}`);
    });
  });
}

console.log('═'.repeat(80));
if (failCount === 0) {
  console.log(`✨ All ${successCount} DSL types converted successfully!`);
} else {
  console.log(`⚠️  Converted ${successCount} files, ${failCount} failed`);
  process.exit(1);
}