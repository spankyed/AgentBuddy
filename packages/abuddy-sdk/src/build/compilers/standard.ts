import { compileSourceDir } from '../compile-utils.ts';
import type { SpecialtyCompiler, CompilationContext, ValidationResult } from '../seed-compiler.ts';
import type { CompiledEntry, CompileResult } from '../compile-utils.ts';
import { loadFlowsFromDir, validateFlows, hashFlows } from './compile-flows.ts';
import { loadSettingsFromFile, deepMerge } from './compile-settings.ts';
import type { FlowDSL } from './flow-types.ts';
import { stepRegistry } from '../../steps/registry.ts';

/** Entries from a source directory of DSL functions, with duplicate labels rejected */
function uniqueEntries(kind: string, compiled: CompileResult): CompiledEntry[] {
  const seen = new Set<string>();
  for (const entry of compiled.entries) {
    if (seen.has(entry.label)) throw new Error(`Duplicate ${kind} label "${entry.label}"`);
    seen.add(entry.label);
  }
  for (const warning of compiled.warnings) console.warn(`  ! ${warning}`);
  return compiled.entries;
}

/** A compiled action or prompt, tagged with the entity type it seeds */
export type CompiledSeedEntry = CompiledEntry & { entity: string };

interface DslCompiled {
  records: CompiledSeedEntry[];
  errors: string[];
}

const labelledItems = (data: DslCompiled) => data.records.map((record) => ({
  key: record.label,
  ...(record.description && { description: record.description }),
}));

export const actionsCompiler: SpecialtyCompiler<DslCompiled> = {
  async compile(dir) {
    const compiled = await compileSourceDir(dir, {
      functionName: 'action',
      isAsync: true,
      fields: { metaInput: 'input', fnBody: 'actionFn', output: 'output' },
    });
    return { records: uniqueEntries('action', compiled).map((entry) => ({ entity: 'Action', ...entry })), errors: compiled.errors };
  },
  collectErrors: (data) => data.errors,
  output: (data) => ({ records: data.records }),
  count: (data) => data.records.length,
  items: labelledItems,
};

export const promptsCompiler: SpecialtyCompiler<DslCompiled> = {
  async compile(dir) {
    const compiled = await compileSourceDir(dir, {
      functionName: 'template',
      isAsync: false,
      fields: { metaInput: 'inputs', fnBody: 'templateFn', output: 'outputSchema' },
    });
    return { records: uniqueEntries('prompt', compiled).map((entry) => ({ entity: 'Prompt', ...entry })), errors: compiled.errors };
  },
  collectErrors: (data) => data.errors,
  output: (data) => ({ records: data.records }),
  count: (data) => data.records.length,
  items: labelledItems,
};

export const flowsCompiler: SpecialtyCompiler<FlowDSL> = {
  async compile(dir) {
    return (await loadFlowsFromDir(dir)).merged;
  },

  validate(flows: FlowDSL, context: CompilationContext): ValidationResult {
    if (Object.keys(flows).length === 0) return { valid: true, errors: [] };
    const actions = context.getCompiled<DslCompiled>('actions')?.records ?? [];
    const prompts = context.getCompiled<DslCompiled>('prompts')?.records ?? [];
    return validateFlows(
      flows,
      actions.map((action) => action.label),
      prompts.map((prompt) => prompt.label),
      { steps: stepRegistry.all() },
    );
  },

  output: (flows) => (Object.keys(flows).length > 0 ? hashFlows(flows) : {}),
  count: (flows) => Object.keys(flows).length,
  items: (flows) => Object.entries(flows).map(([name, flow]) => {
    const description: unknown = Array.isArray(flow) ? undefined : (flow as { description?: unknown }).description;
    return { key: name, ...(typeof description === 'string' && { description }) };
  }),
};

/** The pack's base settings file merged with each feature's settings */
export const settingsCompiler: SpecialtyCompiler<Record<string, unknown>> = {
  async compile(filePath, { featureSettingsPaths }) {
    let merged = await loadSettingsFromFile(filePath);
    for (const feature of featureSettingsPaths) {
      merged = deepMerge(merged, await loadSettingsFromFile(feature.settingsPath));
    }
    return merged;
  },
  count: () => 1,
  items: () => [{ key: 'default-settings', description: 'Application defaults' }],
};

/** Seed keys the SDK compiles itself */
export const SPECIALTY_COMPILERS: Record<string, SpecialtyCompiler> = {
  actions: actionsCompiler as SpecialtyCompiler,
  prompts: promptsCompiler as SpecialtyCompiler,
  flows: flowsCompiler as SpecialtyCompiler,
  settings: settingsCompiler as SpecialtyCompiler,
};
