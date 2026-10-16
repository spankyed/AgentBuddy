export { _stepBackendParts } from './step-backend-declaration.ts';
export { defineHandlers, defineSystem, SYSTEM_EVENT_TYPES, type Handlers, type SystemSpec, type SystemEvents, type SystemContract, type MachineMatchesContract } from './define-system.ts';
export type { ArrayChanges, DiffResult } from '../utils/change-detection.ts';
export { packSystem, type SystemEntry } from './system-utils.ts';
export type { PackRegistration, PackFeature, PackFeatureSystem, PackFeaturePlugin, PackLifecycleHooks, PackEARS, PackMigration } from './pack-registration.ts';
export type { ContentRuntime } from './content-runtime.ts';
export { _pluginTargets, type PluginDeclaration, type ComponentTarget } from './plugin-declaration.ts';
export { getPackHelp, type HelpDocument, type HelpArticle, type HelpProblem, type HelpCatalog, type HelpTarget } from './pack-help.ts';
export { getSettingsCatalog, type SettingsCatalog } from './pack-settings.ts';
export { getPackCommands, type PackCommand } from './pack-commands.ts';
export type { SettingsDefinition, SettingsSchema, SettingsProblem, SettingsValidator } from './settings-definition.ts';
export { _packDeclarationProblem, _nativePackDeclarationProblem } from './declaration-binding.ts';
export { _compileSettingsDefinition, _settingsJsonProblems } from './settings-validation.ts';
export { onPackCatalogChanged, type NativePackDeclaration } from './pack-catalog.ts';

export { _referenceTargets, type ReferenceDeclarations, type ReferenceTypeDeclaration, type ReferenceCategoryDeclaration, type ReferenceSvgElement } from './reference-declaration.ts';

export type { PackCatalogView, DslCatalogEntry, DslDeclaration, ReferenceCatalogEntry, FrontendCatalogEntry, StepCatalogEntry, ArtifactCatalogEntry, BlockCatalogEntry, ArtifactDeclaration, BlockDeclaration, DeclarationData } from './catalog-view.ts';

export { formatReferenceHref, parseReferenceHref, type ReferenceTarget } from './reference-link.ts';

export { _packEntities, _packEntityTypes, _packRelationTypes, type PackDataDeclarations, type _PackEntityDeclaration } from './data-declaration.ts';

export { LIFECYCLE_HOOK_NAMES, type PackLifecycleDeclaration } from './lifecycle-declaration.ts';
export type { FrontendDeclaration, TiptapPluginDeclaration } from './frontend-declaration.ts';
export { _stepFrontendTargets, type StepFrontendDeclaration, type StepLayoutDeclaration } from './step-frontend-declaration.ts';
