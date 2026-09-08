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
} from './compilers';
export type {
  FlowDSL, FlowConfig, Track, DSLStepNode,
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
  PackFeatureEntry, PackBootConfig,
} from './manifest';
export { seedFile, seedPath } from './manifest';

// Entry codegen
export { generatePackFiles } from './generate-entries';
export type { GenerateEntriesOptions } from './generate-entries';
