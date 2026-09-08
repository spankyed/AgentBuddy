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

// Cron validation
export { validateCronExpression } from './cron-utils';

// Pack preview types
export type { PackSeedsPreview, PackSeedPreviewItem, PackSeedType, PackSeedItemKind } from './preview';

// Manifest bridge
export { buildPackConfigFromManifest, resolveFeatureSettingsFromManifest } from './manifest-bridge';

// Pack manifest types
export type {
  PackManifest, PackTypeManifest, PackSnapshot, PackPermission,
  PackPluginDefinition, PackSystemEntry, PackPluginEntry,
  PackFeatureEntry, PackBootConfig, SeedEntryConfig,
  StepEntry, StepDSLMeta,
} from './manifest';
export { seedFile, seedPath } from './manifest';

// Flow DSL helpers (track builders)
export { entry, on } from './flow-helpers';

// Entry codegen
export { generatePackFiles } from './generate-entries';
export type { GenerateEntriesOptions } from './generate-entries';
