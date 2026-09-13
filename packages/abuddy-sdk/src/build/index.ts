// Types
export type { PackConfig, FeatureConfig, CompilePackOptions, CompilePackResult } from './types.ts';

// Seed compiler framework
export { compilePack } from './seed-compiler.ts';
export type { SeedCompiler, CompileEntry, CompilationContext, ValidationError, ValidationResult } from './seed-compiler.ts';

// Compile utilities
export { compileSourceDir, bundleFile, sourceHash } from './compile-utils.ts';
export type { CompileConfig, CompiledEntry, CompileResult } from './compile-utils.ts';

// Compilers: standard instances, build utilities, types
export {
  actionsCompiler, promptsCompiler, flowsCompiler,
  libraryCompiler, notesCompiler, faqCompiler, settingsCompiler,
  loadFlowsFromDir, validateFlows, hashFlows,
  compileLibraryFromDir, copyLibraryMedia,
  compileNotesFromDir, copyNotesMedia,
  compileFaqFromDir,
  loadSettingsFromFile, deepMerge,
  countDocs, toDisplayName, parseFrontmatter, parseMarkdownSections,
  isFlowConfig, resolveTracks, ROOT_FLOW_ROLE,
  validateFlowDSL,
  compileFlowDSL,
  exportFlowsToDSL,
} from './compilers/index.ts';
export type {
  FlowDSL, FlowConfig, Track, DSLNodeBase, DSLStepNode,
  FlowEntity, NodeBase, EdgeEntity,
  CompilerContext, CompiledFlow, CompiledEntity, CompiledRelation, CompiledRole,
  FlowEARS, CompiledRows, ExportFlowsOptions,
  ContentSection, ExportedDocument, ExportedCollection, ExportedSymlink, ExportedItem,
  ExportedLibrary,
  ExportedNote, ExportedNotes,
  CompiledFAQ,
} from './compilers/index.ts';

// Pack preview types
export type { PackSeedsPreview, PackSeedPreviewItem, PackSeedType, PackSeedItemKind } from './preview.ts';

// Manifest bridge
export { buildPackConfigFromManifest, resolveFeatureSettingsFromManifest } from './manifest-bridge.ts';

// Pack manifest types
export type {
  PackManifest, PackTypeManifest, PackSnapshot, PackPermission,
  PackSystemEntry, PackPluginEntry,
  PackFeatureEntry, PackBootConfig, SeedEntryConfig,
  StepEntry, StepDSLMeta,
} from './manifest.ts';
export { seedFile, seedPath } from './manifest.ts';

// Flow DSL helpers (track builders)
export { entry, on } from './flow-helpers.ts';

// Seed authoring types
export type { ActionParameter, ActionMeta, TemplateInput, PromptMeta } from './seed-types.ts';

// Entry codegen
export { generatePackFiles, emitEARS, mergeRegistries, emitDepTypes } from './generate-entries.ts';
export type { GenerateEntriesOptions } from './generate-entries.ts';

// Resolve conditions for building pack code against a linked checkout
export { sourceConditions } from './source-conditions.ts';

// Pack validation
export { validateManifest, validateFeatures, parseManifest } from './validate.ts';
export type { ManifestValidation } from './validate.ts';

// Manifest schema (Zod — single source of truth for types, validation, and JSON schema generation)
export {
  ManifestSchema, FeatureEntrySchema, FEATURE_ID_PATTERN,
  BootConfigSchema, SeedEntryConfigSchema, StepEntrySchema, StepDSLMetaSchema,
  DslEntrySchema, PackPermissionSchema,
} from './manifest-schema.ts';

// FE bundler — not re-exported here (uses import.meta which some
// consumer tsconfigs reject). Import directly from './fe-bundler'.
