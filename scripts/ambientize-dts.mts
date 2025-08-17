#!/usr/bin/env node

/**
 * Ambientizer - Converts module-form .d.ts to ambient declarations
 * Based on TypeScript compiler API for reliability and performance
 */

import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

function ambientize(text: string, globalNs: string): string {
  const sourceFile = ts.createSourceFile(
    'input.d.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  
  const factory = ts.factory;
  const globalStatements: ts.Statement[] = [];
  
  // Helper to strip export/default modifiers
  const stripExportModifiers = <T extends ts.Node>(node: T): T => {
    if (!('modifiers' in node) || !node.modifiers) return node;
    
    const filteredModifiers = node.modifiers.filter(
      m => m.kind !== ts.SyntaxKind.ExportKeyword && 
           m.kind !== ts.SyntaxKind.DefaultKeyword
    );
    
    if (filteredModifiers === node.modifiers) return node;
    
    // Create a new node with filtered modifiers
    // @ts-expect-error - We know this node has modifiers
    return { ...node, modifiers: factory.createNodeArray(filteredModifiers) };
  };
  
  // Helper to ensure declare modifier
  const ensureDeclareModifier = <T extends ts.Node>(node: T): T => {
    if (!('modifiers' in node)) return node;
    
    const modifiers = node.modifiers ?? factory.createNodeArray([]);
    const hasDeclare = modifiers.some(m => m.kind === ts.SyntaxKind.DeclareKeyword);
    
    if (hasDeclare) return node;
    
    const newModifiers = factory.createNodeArray([
      factory.createModifier(ts.SyntaxKind.DeclareKeyword),
      ...modifiers
    ]);
    
    // @ts-expect-error - We know this node can have modifiers
    return { ...node, modifiers: newModifiers };
  };
  
  // Process each statement
  const processStatement = (stmt: ts.Statement): ts.Statement | undefined => {
    // Skip imports/exports
    if (
      ts.isImportDeclaration(stmt) ||
      ts.isImportEqualsDeclaration(stmt) ||
      ts.isExportDeclaration(stmt) ||
      ts.isExportAssignment(stmt)
    ) {
      return undefined;
    }
    
    // Handle module declarations (declare global blocks)
    if (ts.isModuleDeclaration(stmt)) {
      const text = stmt.getText();
      
      // Check if this is a declare global block
      if (text.includes('declare global')) {
        // Extract the content and add to global statements
        if (stmt.body && ts.isModuleBlock(stmt.body)) {
          globalStatements.push(...stmt.body.statements);
        }
        return undefined; // Don't include in namespace
      }
    }
    
    // Process declarations - strip export and add declare where needed
    if (
      ts.isInterfaceDeclaration(stmt) ||
      ts.isTypeAliasDeclaration(stmt) ||
      ts.isClassDeclaration(stmt) ||
      ts.isFunctionDeclaration(stmt) ||
      ts.isEnumDeclaration(stmt) ||
      ts.isModuleDeclaration(stmt)
    ) {
      let processed = stripExportModifiers(stmt);
      
      // Add declare to functions, classes, enums, and variable statements
      if (
        ts.isFunctionDeclaration(processed) ||
        ts.isClassDeclaration(processed) ||
        ts.isEnumDeclaration(processed)
      ) {
        processed = ensureDeclareModifier(processed);
      }
      
      return processed;
    }
    
    // Handle variable statements
    if (ts.isVariableStatement(stmt)) {
      let processed = stripExportModifiers(stmt);
      processed = ensureDeclareModifier(processed);
      return processed;
    }
    
    // Pass through other statements
    return stmt;
  };
  
  // Process all statements
  const namespaceStatements = sourceFile.statements
    .map(processStatement)
    .filter((s): s is ts.Statement => s !== undefined);
  
  // Create the namespace declaration
  const namespaceBlock = factory.createModuleBlock(namespaceStatements);
  const namespaceDecl = factory.createModuleDeclaration(
    [factory.createModifier(ts.SyntaxKind.DeclareKeyword)],
    factory.createIdentifier(globalNs),
    namespaceBlock,
    ts.NodeFlags.Namespace
  );
  
  // Combine global statements (if any) with namespace
  const outputStatements: ts.Statement[] = [];
  
  // Add declare global block if we have global statements
  if (globalStatements.length > 0) {
    const globalBlock = factory.createModuleBlock(globalStatements);
    const globalDecl = factory.createModuleDeclaration(
      [factory.createModifier(ts.SyntaxKind.DeclareKeyword)],
      factory.createIdentifier('global'),
      globalBlock,
      ts.NodeFlags.GlobalAugmentation
    );
    outputStatements.push(globalDecl);
  }
  
  // Add the namespace
  outputStatements.push(namespaceDecl);
  
  // Create output source file
  const outputFile = factory.updateSourceFile(sourceFile, outputStatements);
  
  // Print the result
  const printer = ts.createPrinter({ 
    newLine: ts.NewLineKind.LineFeed,
    removeComments: false 
  });
  
  const result = printer.printFile(outputFile);
  
  // Add header comment
  return `// Generated ambient declarations for ${globalNs}\n` + result;
}

// CLI interface
const main = () => {
  const args = process.argv.slice(2);
  const inputPath = args[0];
  const outputPath = args[1];
  const namespaceName = args[2];
  
  if (!inputPath || !outputPath || !namespaceName) {
    console.error('Usage: tsx ambientize-dts.mts <input.d.ts> <output.d.ts> <NamespaceName>');
    process.exit(1);
  }
  
  try {
    const inputContent = readFileSync(inputPath, 'utf8');
    const outputContent = ambientize(inputContent, namespaceName);
    writeFileSync(outputPath, outputContent, 'utf8');
    console.log(`✅ Ambientized ${basename(inputPath)} → ${basename(outputPath)} as namespace ${namespaceName}`);
  } catch (error) {
    console.error(`❌ Error processing ${inputPath}:`, error);
    process.exit(1);
  }
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}