import { getHostModule } from '../runtime/host';

// --- Paths ---
let _pathsMod: any;
function pathsMod() { if (!_pathsMod) _pathsMod = getHostModule('paths'); return _pathsMod; }

export function getMediaPath(...args: any[]) { return pathsMod().getMediaPath(...args); }
export function getLmdbPath(...args: any[]) { return pathsMod().getLmdbPath(...args); }
export function getVolatileLmdbPath(...args: any[]) { return pathsMod().getVolatileLmdbPath(...args); }
export function getSecretsLmdbPath(...args: any[]) { return pathsMod().getSecretsLmdbPath(...args); }
export function createExportDir(...args: any[]) { return pathsMod().createExportDir(...args); }
export function ensureDirectoryExists(...args: any[]) { return pathsMod().ensureDirectoryExists(...args); }

// --- Media ---
let _mediaMod: any;
function mediaMod() { if (!_mediaMod) _mediaMod = getHostModule('media'); return _mediaMod; }

export function extractMediaRefs(...args: any[]) { return mediaMod().extractMediaRefs(...args); }
export function copyMediaByRef(...args: any[]) { return mediaMod().copyMediaByRef(...args); }
export function rewriteMediaUrls(...args: any[]) { return mediaMod().rewriteMediaUrls(...args); }
export function copyFlatMedia(...args: any[]) { return mediaMod().copyFlatMedia(...args); }
export function resolveMedia(...args: any[]) { return mediaMod().resolveMedia(...args); }
export function readMediaBuffer(...args: any[]) { return mediaMod().readMediaBuffer(...args); }
export function extractAndResolveImages(...args: any[]) { return mediaMod().extractAndResolveImages(...args); }
export function stripMediaRefs(...args: any[]) { return mediaMod().stripMediaRefs(...args); }
export function restoreJsonMediaRefs(...args: any[]) { return mediaMod().restoreJsonMediaRefs(...args); }
export function restoreMarkdownMediaRefs(...args: any[]) { return mediaMod().restoreMarkdownMediaRefs(...args); }
export type MediaRef = any;

// --- Export ---
let _exportMod: any;
function exportMod() { if (!_exportMod) _exportMod = getHostModule('export'); return _exportMod; }

export function writeExportJson(...args: any[]) { return exportMod().writeExportJson(...args); }
export function writeExportFile(...args: any[]) { return exportMod().writeExportFile(...args); }
export function stripInternalFields(...args: any[]) { return exportMod().stripInternalFields(...args); }
export function toSlug(...args: any[]) { return exportMod().toSlug(...args); }
export function uniqueFilename(...args: any[]) { return exportMod().uniqueFilename(...args); }

// --- Resolve CLI ---
let _cliMod: any;
function cliMod() { if (!_cliMod) _cliMod = getHostModule('resolve-cli'); return _cliMod; }

export function resolveForService(...args: any[]) { return cliMod().resolveForService(...args); }
export function testCli(...args: any[]) { return cliMod().testCli(...args); }
export function isCliName(...args: any[]) { return cliMod().isCliName(...args); }
export function clearCliPathCache(...args: any[]) { return cliMod().clearCliPathCache(...args); }

// --- Settings Changes ---
let _settingsChangesMod: any;
function settingsChangesMod() { if (!_settingsChangesMod) _settingsChangesMod = getHostModule('settings-changes'); return _settingsChangesMod; }

export function toMap(...args: any[]) { return settingsChangesMod().toMap(...args); }
export function toIdentifierSet(...args: any[]) { return settingsChangesMod().toIdentifierSet(...args); }
export function mapScalar(...args: any[]) { return settingsChangesMod().mapScalar(...args); }
export function mapArray(...args: any[]) { return settingsChangesMod().mapArray(...args); }
export type ChangeBlock = any;

// --- Random ID ---
let _randomIdMod: any;
function randomIdMod() { if (!_randomIdMod) _randomIdMod = getHostModule('random-id'); return _randomIdMod; }

export function randomId(...args: any[]) { return randomIdMod().randomId(...args); }

// --- Binary Operator ---
let _binaryOpMod: any;
function binaryOpMod() { if (!_binaryOpMod) _binaryOpMod = getHostModule('binary-operator'); return _binaryOpMod; }

export function getBinaryOperator() { return binaryOpMod().BinaryOperator; }
export const BinaryOperator: any = new Proxy({} as any, {
  get(_, prop: string) { return binaryOpMod().BinaryOperator[prop]; },
});

// --- Change Detection ---
let _changeDetectionMod: any;
function changeDetectionMod() { if (!_changeDetectionMod) _changeDetectionMod = getHostModule('change-detection'); return _changeDetectionMod; }

export function detectChanges(...args: any[]) { return changeDetectionMod().detectChanges(...args); }

// --- Display Name ---
let _displayNameMod: any;
function displayNameMod() { if (!_displayNameMod) _displayNameMod = getHostModule('display-name'); return _displayNameMod; }

export function toDisplayName(...args: any[]) { return displayNameMod().toDisplayName(...args); }

// --- System Errors ---
let _systemErrorsMod: any;
function systemErrorsMod() { if (!_systemErrorsMod) _systemErrorsMod = getHostModule('system-errors'); return _systemErrorsMod; }

export function reportSystemError(...args: any[]) { return systemErrorsMod().reportSystemError(...args); }

// --- Template Executor ---
let _templateMod: any;
function templateMod() { if (!_templateMod) _templateMod = getHostModule('template-executor'); return _templateMod; }

export function executeTemplate(...args: any[]) { return templateMod().executeTemplate(...args); }

// --- Prompt Context ---
let _promptContextMod: any;
function promptContextMod() { if (!_promptContextMod) _promptContextMod = getHostModule('prompt-context'); return _promptContextMod; }

export function createPromptContext(...args: any[]) { return promptContextMod().createPromptContext(...args); }

// --- Seed ---
let _seedMod: any;
function seedMod() { if (!_seedMod) _seedMod = getHostModule('seed'); return _seedMod; }

export function registerSeeder(...args: any[]) { return seedMod().registerSeeder(...args); }
export function seedData(...args: any[]) { return seedMod().seedData(...args); }
export function seedCollection(...args: any[]) { return seedMod().seedCollection(...args); }
export function loadJSON(...args: any[]) { return seedMod().loadJSON(...args); }
export function shouldSeedAll(...args: any[]) { return seedMod().shouldSeedAll(...args); }
export function filterByInclude(...args: any[]) { return seedMod().filterByInclude(...args); }

// --- Lifecycle ---
let _lifecycleMod: any;
function lifecycleMod() { if (!_lifecycleMod) _lifecycleMod = getHostModule('lifecycle'); return _lifecycleMod; }

export function registerShutdownHook(...args: any[]) { return lifecycleMod().registerShutdownHook(...args); }
export function runShutdownHooks(...args: any[]) { return lifecycleMod().runShutdownHooks(...args); }

// --- Version ---
let _versionMod: any;
function versionMod() { if (!_versionMod) _versionMod = getHostModule('version'); return _versionMod; }

export function getAppVersion() { return versionMod().APP_VERSION; }

// --- Migrations ---
let _migrationsMod: any;
function migrationsMod() { if (!_migrationsMod) _migrationsMod = getHostModule('migrations'); return _migrationsMod; }

export function runMigrations(...args: any[]) { return migrationsMod().runMigrations(...args); }
