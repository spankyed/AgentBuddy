import * as fs from 'fs';
import * as path from 'path';
import { compileSourceDir } from '../compile-utils';
import { seedFile } from '../manifest';
import type { SeedCompiler, CompilationContext, ValidationResult } from '../seed-compiler';
import type { CompiledEntry } from '../compile-utils';
import { loadFlowsFromDir, validateFlows, hashFlows } from './compile-flows';
import { compileLibraryFromDir, copyLibraryMedia } from './compile-library';
import { compileNotesFromDir, copyNotesMedia } from './compile-notes';
import { compileFaqFromDir } from './compile-faq';
import { loadSettingsFromFile, deepMerge } from './compile-settings';
import type { FlowDSL } from './flow-types';
import type { CompiledFAQ } from './compile-faq';
import type { ExportedLibrary } from './compile-library';
import type { ExportedNotes } from './compile-notes';
import { countDocs } from './library-utils';

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// ============================================================================
// Actions Compiler
// ============================================================================

interface ActionsCompiled {
  entries: CompiledEntry[];
  warnings: string[];
}

export const actionsCompiler: SeedCompiler<ActionsCompiled, CompiledEntry[]> = {
  async compile(dir) {
    return compileSourceDir(dir, {
      functionName: 'action',
      isAsync: true,
      fields: { metaInput: 'input', fnBody: 'actionFn', output: 'output' },
    });
  },

  merge(results) {
    const all: CompiledEntry[] = [];
    const seen = new Set<string>();
    for (const { data, packName } of results) {
      for (const entry of data.entries) {
        if (seen.has(entry.label)) {
          throw new Error(`Duplicate action label "${entry.label}" (in ${packName})`);
        }
        seen.add(entry.label);
        all.push(entry);
      }
      if (data.warnings.length) {
        for (const w of data.warnings) console.warn(`  ! ${w}`);
      }
    }
    return all;
  },

  write(outputDir, merged) {
    writeJson(path.join(outputDir, seedFile('actions')), merged);
    console.log(`  ${merged.length} action(s)`);
  },
};

// ============================================================================
// Prompts Compiler
// ============================================================================

export const promptsCompiler: SeedCompiler<ActionsCompiled, CompiledEntry[]> = {
  async compile(dir) {
    return compileSourceDir(dir, {
      functionName: 'template',
      isAsync: false,
      fields: { metaInput: 'inputs', fnBody: 'templateFn', output: 'outputSchema' },
    });
  },

  merge(results) {
    const all: CompiledEntry[] = [];
    const seen = new Set<string>();
    for (const { data, packName } of results) {
      for (const entry of data.entries) {
        if (seen.has(entry.label)) {
          throw new Error(`Duplicate prompt label "${entry.label}" (in ${packName})`);
        }
        seen.add(entry.label);
        all.push(entry);
      }
      if (data.warnings.length) {
        for (const w of data.warnings) console.warn(`  ! ${w}`);
      }
    }
    return all;
  },

  write(outputDir, merged) {
    writeJson(path.join(outputDir, seedFile('prompts')), merged);
    console.log(`  ${merged.length} prompt(s)`);
  },
};

// ============================================================================
// Flows Compiler
// ============================================================================

interface FlowsCompiled {
  merged: FlowDSL;
  loaded: number;
}

export const flowsCompiler: SeedCompiler<FlowsCompiled, FlowDSL> = {
  async compile(dir) {
    return loadFlowsFromDir(dir);
  },

  merge(results) {
    const merged: FlowDSL = {};
    for (const { data, packName } of results) {
      for (const [name, entry] of Object.entries(data.merged)) {
        if (merged[name]) {
          throw new Error(`Duplicate flow name "${name}" (in ${packName})`);
        }
        merged[name] = entry;
      }
    }
    return merged;
  },

  validate(merged: FlowDSL, context: CompilationContext): ValidationResult {
    if (Object.keys(merged).length === 0) return { valid: true, errors: [] };

    const actions = context.getCompiled<CompiledEntry[]>('actions') ?? [];
    const prompts = context.getCompiled<CompiledEntry[]>('prompts') ?? [];
    return validateFlows(
      merged,
      actions.map(a => a.label),
      prompts.map(p => p.label),
    );
  },

  write(outputDir, merged) {
    const output = Object.keys(merged).length > 0 ? hashFlows(merged) : {};
    writeJson(path.join(outputDir, seedFile('flows')), output);
    console.log(`  ${Object.keys(merged).length} flow(s)`);
  },
};

// ============================================================================
// Library Compiler
// ============================================================================

interface LibraryMerged {
  data: ExportedLibrary;
  sourcePaths: string[];
}

export const libraryCompiler: SeedCompiler<ExportedLibrary, LibraryMerged> = {
  async compile(dir) {
    return compileLibraryFromDir(dir);
  },

  merge(results) {
    const items: ExportedLibrary['items'] = [];
    const sourcePaths: string[] = [];
    for (const { data, sourcePath } of results) {
      items.push(...data.items);
      sourcePaths.push(sourcePath);
    }
    return { data: { version: 1, items }, sourcePaths };
  },

  write(outputDir, merged) {
    writeJson(path.join(outputDir, seedFile('library')), merged.data);
    for (const src of merged.sourcePaths) {
      copyLibraryMedia(src, outputDir);
    }
    console.log(`  ${countDocs(merged.data.items)} library doc(s)`);
  },
};

// ============================================================================
// Notes Compiler
// ============================================================================

interface NotesMerged {
  data: ExportedNotes;
  sourcePaths: string[];
}

export const notesCompiler: SeedCompiler<ExportedNotes, NotesMerged> = {
  async compile(dir) {
    return compileNotesFromDir(dir);
  },

  merge(results) {
    const notes: ExportedNotes['notes'] = [];
    const sourcePaths: string[] = [];
    for (const { data, sourcePath } of results) {
      notes.push(...data.notes);
      sourcePaths.push(sourcePath);
    }
    return { data: { version: 1, notes }, sourcePaths };
  },

  write(outputDir, merged) {
    writeJson(path.join(outputDir, seedFile('notes')), merged.data);
    for (const src of merged.sourcePaths) {
      copyNotesMedia(src, outputDir);
    }
    const count = merged.data.notes.reduce((s: number, n: any) => s + 1 + (n.children?.length ?? 0), 0);
    console.log(`  ${count} note(s)`);
  },
};

// ============================================================================
// FAQ Compiler
// ============================================================================

export const faqCompiler: SeedCompiler<CompiledFAQ[], CompiledFAQ[]> = {
  async compile(dir) {
    return compileFaqFromDir(dir);
  },

  merge(results) {
    const all: CompiledFAQ[] = [];
    for (const { data } of results) {
      all.push(...data);
    }
    all.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
    return all;
  },

  write(outputDir, merged) {
    writeJson(path.join(outputDir, seedFile('faq')), merged);
    console.log(`  ${merged.length} faq(s)`);
  },
};

// ============================================================================
// Settings Compiler
// ============================================================================

export const settingsCompiler: SeedCompiler<Record<string, any>, Record<string, any>> = {
  async compile(filePath) {
    return loadSettingsFromFile(filePath);
  },

  merge(results) {
    let merged: Record<string, any> = {};
    for (const { data } of results) {
      merged = deepMerge(merged, data);
    }
    return merged;
  },

  write(outputDir, merged) {
    writeJson(path.join(outputDir, seedFile('settings')), merged);
    console.log(`  settings compiled`);
  },
};
