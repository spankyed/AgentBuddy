// Types
export type { PackConfig, PackBuildDefinitions, CompilePackOptions, CompilePackResult } from './types.ts';

// Seed compiler framework
export { _clearCompiledSeeds, compilePack, SEED_INDEX_FILE } from './seed-compiler.ts';
export { compileMarkdownTree, parseMarkdownFile, toDisplayName, type MarkdownItem, type MarkdownTreeOptions } from './seeds/markdown-tree.ts';
export {
  compileBuiltinFormat, checkRecordEntities, recordLabel, formatEntities, withSourceHashes, defaultSourceHash, RECORD_KEYS,
  type SeedRecord, type CompiledSeedFile, type SeedFieldSource, type SeedFieldSpec, type SeedTreeSpec,
  type SeedCompileContext, type SeedCompilerModule,
} from './seeds/records.ts';
export { resolveSeeds, type ResolvedSeed, type SeedDependency, type SeedCompilerModuleRef } from './seeds/resolve.ts';
export type { SpecialtyCompiler, SpecialtyCompileContext, CompilationContext, ValidationError, ValidationResult, SeedIndex, SeedIndexEntry } from './seed-compiler.ts';

// Compile utilities
export { compileSourceDir, bundleFile, sourceHash } from './compile-utils.ts';
export type { CompileConfig, CompiledEntry, CompileResult } from './compile-utils.ts';

// Compilers: standard instances, build utilities, types
export {
  actionsCompiler, promptsCompiler, flowsCompiler, SPECIALTY_COMPILERS,
  loadFlowsFromDir, validateFlows, hashFlows,
  isFlowConfig, resolveTracks,
  validateFlowDSL,
  compileFlowDSL,
  exportFlowsToDSL,
} from './compilers/index.ts';
export type {
  FlowDSL, FlowConfig, Track, DSLNodeBase, DSLStepNode,
  CompilerContext, CompiledRows, ExportFlowsOptions, CompiledSeedEntry,
} from './compilers/index.ts';

// Pack preview types
export type { PackSeedsPreview, PackSeedPreviewItem } from './preview.ts';

// Manifest bridge
export { buildPackConfigFromManifest } from './manifest-bridge.ts';

// Pack manifest types
export type {
  PackManifest, PackTypeManifest, PackSnapshot, PackFlowHelpers, PackPermission,
  PackProvenance, ProvenanceKind, ProvenanceManifest, ProvenanceSource,
  PackSystemEntry, PackPluginEntry,
  PackFeatureEntry, PackBootConfig, SeedEntryConfig, SeedFormatConfig,
  StepEntry, StepDSLMeta,
} from './manifest.ts';
export { seedFile, seedPath, SEED_COMPILERS_FILE, PROVENANCE_KINDS, PACK_SNAPSHOT_FORMAT, _snapshotFormatMismatch, _mergeProvenance, _buildProvenance, _provenanceRecord } from './manifest.ts';

// Flow DSL helpers (track builders)
export { entry, on } from './flow-helpers.ts';

// Seed authoring types
export type { ActionMeta, PromptMeta } from './seed-types.ts';

// Entry codegen
export {
  generatePackFiles, emitEARS, mergeRegistries, entitiesWithoutShapes, PACK_TYPES_DEF,
  _depTypesFile, _depTypesVersion,
} from './generate-entries.ts';
export type { GenerateEntriesOptions } from './generate-entries.ts';
export { _TYPES_UNRESOLVED } from './module-exports.ts';

// Resolve conditions for building pack code against a linked checkout

// Pack validation
export { validateManifest, validateFeatures, parseManifest } from './validate.ts';
export type { ManifestValidation } from './validate.ts';

// Manifest schema (Zod — single source of truth for types, validation, and JSON schema generation)
export {
  ManifestSchema, FeatureEntrySchema, FEATURE_ID_PATTERN,
  BootConfigSchema, SeedEntryConfigSchema, SeedFormatSchema, StepEntrySchema, StepDSLMetaSchema,
  DslEntrySchema, PackPermissionSchema,
} from './manifest-schema.ts';

// FE bundler — not re-exported here (uses import.meta which some
// consumer tsconfigs reject). Import directly from './fe-bundler'.
