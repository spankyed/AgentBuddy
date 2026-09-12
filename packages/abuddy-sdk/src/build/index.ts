// Types
export type { PackConfig, FeatureConfig, CompilePackOptions, CompilePackResult } from './types';

// Seed compiler framework
export { compilePack } from './seed-compiler';
export type { SeedCompiler, CompileEntry, CompilationContext, ValidationError, ValidationResult } from './seed-compiler';

// Compile utilities
export { compileSourceDir, bundleFile, sourceHash } from './compile-utils';
export type { CompileConfig, CompiledEntry, CompileResult } from './compile-utils';

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
} from './compilers';
export type {
  FlowDSL, FlowConfig, Track, DSLNodeBase, DSLStepNode,
  FlowEntity, NodeBase, EdgeEntity,
  CompilerContext, CompiledFlow, CompiledEntity, CompiledRelation, CompiledRole,
  FlowEARS, CompiledRows, ExportFlowsOptions,
  ContentSection, ExportedDocument, ExportedCollection, ExportedSymlink, ExportedItem,
  ExportedLibrary,
  ExportedNote, ExportedNotes,
  CompiledFAQ,
} from './compilers';

// Shared dependency registry (FE/BE externalization + host resolution)
export {
  getSharedFeDeps, getSdkFeModules, getSharedBeDeps, findSdkVersion,
} from './shared-deps';
export type { SharedDep } from './shared-deps';

// Pack preview types
export type { PackSeedsPreview, PackSeedPreviewItem, PackSeedType, PackSeedItemKind } from './preview';

// Manifest bridge
export { buildPackConfigFromManifest, resolveFeatureSettingsFromManifest } from './manifest-bridge';

// Pack manifest types
export type {
  PackManifest, PackTypeManifest, PackSnapshot, PackPermission,
  PackSystemEntry, PackPluginEntry,
  PackFeatureEntry, PackBootConfig, SeedEntryConfig,
  StepEntry, StepDSLMeta,
} from './manifest';
export { seedFile, seedPath } from './manifest';

// Flow DSL helpers (track builders)
export { entry, on } from './flow-helpers';

// Seed authoring types
export type { ActionParameter, ActionMeta, TemplateInput, PromptMeta } from './seed-types';

// Entry codegen
export { generatePackFiles, emitEARS, mergeRegistries, emitDepTypes } from './generate-entries';
export type { GenerateEntriesOptions } from './generate-entries';

// Built-in pack discovery (build-time)
export { discoverBuiltInPacksForBuild } from './discover';
export type { BuiltInPackBuildInfo } from './discover';

// Pack validation
export { validateManifest, validateFeatures, parseManifest } from './validate';
export type { ManifestValidation } from './validate';

// Manifest schema (Zod — single source of truth for types, validation, and JSON schema generation)
export {
  ManifestSchema, FeatureEntrySchema,
  BootConfigSchema, SeedEntryConfigSchema, StepEntrySchema, StepDSLMetaSchema,
  DslEntrySchema, PackPermissionSchema,
} from './manifest-schema';

// FE bundler — not re-exported here (uses import.meta which some
// consumer tsconfigs reject). Import directly from './fe-bundler'.
