// Types
export type { PackConfig, FeatureConfig, CompilePackOptions, CompilePackResult } from './types.js';

// Seed compiler framework
export { compilePack } from './seed-compiler.js';
export type { SeedCompiler, CompileEntry, CompilationContext, ValidationError, ValidationResult } from './seed-compiler.js';

// Compile utilities
export { compileSourceDir, bundleFile, sourceHash } from './compile-utils.js';
export type { CompileConfig, CompiledEntry, CompileResult } from './compile-utils.js';

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
} from './compilers/index.js';
export type {
  FlowDSL, FlowConfig, Track, DSLNodeBase, DSLStepNode,
  FlowEntity, NodeBase, EdgeEntity,
  CompilerContext, CompiledFlow, CompiledEntity, CompiledRelation, CompiledRole,
  FlowEARS, CompiledRows, ExportFlowsOptions,
  ContentSection, ExportedDocument, ExportedCollection, ExportedSymlink, ExportedItem,
  ExportedLibrary,
  ExportedNote, ExportedNotes,
  CompiledFAQ,
} from './compilers/index.js';

// Pack preview types
export type { PackSeedsPreview, PackSeedPreviewItem, PackSeedType, PackSeedItemKind } from './preview.js';

// Manifest bridge
export { buildPackConfigFromManifest, resolveFeatureSettingsFromManifest } from './manifest-bridge.js';

// Pack manifest types
export type {
  PackManifest, PackTypeManifest, PackSnapshot, PackPermission,
  PackSystemEntry, PackPluginEntry,
  PackFeatureEntry, PackBootConfig, SeedEntryConfig,
  StepEntry, StepDSLMeta,
} from './manifest.js';
export { seedFile, seedPath } from './manifest.js';

// Flow DSL helpers (track builders)
export { entry, on } from './flow-helpers.js';

// Seed authoring types
export type { ActionParameter, ActionMeta, TemplateInput, PromptMeta } from './seed-types.js';

// Entry codegen
export { generatePackFiles, emitEARS, mergeRegistries, emitDepTypes } from './generate-entries.js';
export type { GenerateEntriesOptions } from './generate-entries.js';

// Resolve conditions for building pack code against a linked checkout
export { sourceConditions } from './source-conditions.js';

// Pack validation
export { validateManifest, validateFeatures, parseManifest } from './validate.js';
export type { ManifestValidation } from './validate.js';

// Manifest schema (Zod — single source of truth for types, validation, and JSON schema generation)
export {
  ManifestSchema, FeatureEntrySchema, FEATURE_ID_PATTERN,
  BootConfigSchema, SeedEntryConfigSchema, StepEntrySchema, StepDSLMetaSchema,
  DslEntrySchema, PackPermissionSchema,
} from './manifest-schema.js';

// FE bundler — not re-exported here (uses import.meta which some
// consumer tsconfigs reject). Import directly from './fe-bundler'.
