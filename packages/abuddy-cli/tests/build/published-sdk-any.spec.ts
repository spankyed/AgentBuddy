import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGES_BUILT, installPublishedPackages } from '../helpers/published-packages';

/**
 * No pack-facing @abuddy/sdk export exposes `any`: an export whose type (its signature, members or
 * type arguments, a few levels deep) contains `any` fails unless it's listed here with a reason.
 * @abuddy/sdk/ears, @abuddy/sdk/services and the root entry have none. Entries leave this list as
 * their modules are typed; a listed export that no longer contains `any` fails too.
 */
const ALLOWED_ANY: Record<string, { reason: string; exports: string[] }> = {
  './framework': {
    reason: 'system machines and boot hooks use XState AnyStateMachine-style any',
    exports: ['toPackSystemDefs', 'SystemEntry', 'PackRegistration', 'PackSystemDef', 'PackBootHooks'],
  },
  './helpers': {
    reason: 'actor lookup helpers return untyped actor refs',
    exports: ['sendParentSafe', 'getActor', 'getBus'],
  },
  './fe': {
    reason: 'Vue component and XState actor references typed any (Plugin components, actor system accessors, context menu and tiptap registries)',
    exports: ['Plugin', 'RouteComponents', 'PackFERegistration', 'useActorSystem', 'useApplicationActor', 'EXTRA_BLOCK_ITEMS_KEY', 'TIPTAP_PLUGINS_KEY', 'tiptapPluginRegistry', 'BlockItem', 'TiptapPlugin', 'breadcrumbList', 'staticBreadcrumbList', 'contextMenu', 'contextMenuFn', 'ContextMenuItem', 'ContextMenuMeta', 'targetIs', 'TrailClickEvent', 'useSettingsSaveStatus', 'navigateToPlugin'],
  },
  './fe/contributions': {
    reason: 'tiptap contribution item providers take untyped nodes',
    exports: ['ContributionTypeConfig', 'CategoryConfig', 'CategoryItemsProvider'],
  },
  './actions': {
    reason: 'provider errors are untyped',
    exports: ['formatProviderError'],
  },
  './artifacts': {
    reason: 'artifact items carry untyped data',
    exports: ['ArtifactItem', 'artifactRegistry'],
  },
  './blocks': {
    reason: 'block definitions carry untyped props',
    exports: ['BlockDefinition', 'BlockBEFacet', 'blockRegistry'],
  },
  './steps': {
    reason: 'step runtime facets receive untyped node configs and services',
    exports: ['stepRegistry', 'StepRuntimeFacet', 'TriggerFacet', 'TriggerRuntimeContext', 'RuntimeServices', 'ExecutionContext'],
  },
  './build': {
    reason: 'compilers, seed/flow DSL JSON and zod schema internals typed any',
    exports: ['compileSourceDir', 'CompiledEntry', 'CompileResult', 'actionsCompiler', 'promptsCompiler', 'libraryCompiler', 'settingsCompiler', 'compileLibraryFromDir', 'loadSettingsFromFile', 'deepMerge', 'countDocs', 'parseMarkdownSections', 'compileFlowDSL', 'exportFlowsToDSL', 'EdgeEntity', 'CompiledFlow', 'CompiledEntity', 'CompiledRelation', 'FlowEARS', 'ExportFlowsOptions', 'ContentSection', 'ExportedDocument', 'ExportedCollection', 'ExportedItem', 'ExportedLibrary', 'ActionParameter', 'ActionMeta', 'TemplateInput', 'PromptMeta', 'ManifestSchema', 'FeatureEntrySchema', 'BootConfigSchema', 'SeedEntryConfigSchema', 'StepEntrySchema', 'StepDSLMetaSchema', 'DslEntrySchema'],
  },
  './runtime': {
    reason: 'template resolver inputs and host functions typed any',
    exports: ['hostFn', 'executeTemplate', 'createTemplateResolver', 'TemplateResolver'],
  },
  './logger': {
    reason: 'log event values typed any',
    exports: ['createInspectLogger', 'InspectLogger', 'LogEvent', 'LogEventValue'],
  },
  './rpc': {
    reason: 'tRPC client and root event bus typed any',
    exports: ['trpc', 'rootEvents', 'IncomingSystemEvents'],
  },
  './utils': {
    reason: 'object path and diff utilities over untyped values',
    exports: ['reportSystemError', 'registerSeeder', 'seedCollection', 'SeederContext', 'Seeder', 'extractValueByPath', 'detectAllArrayChanges'],
  },
  './utils/pure': {
    reason: 'object path and diff utilities over untyped values',
    exports: ['extractValueByPath', 'detectAllArrayChanges'],
  },
  './inference': {
    reason: 'Vercel AI SDK call options and results passed through as any',
    exports: ['streamText', 'generateText', 'streamObject', 'generateObject'],
  },
  './seed': {
    reason: 'seeders read untyped seed JSON',
    exports: ['createCollectionSeeder', 'createFlowSeeder', 'createLibrarySeeder', 'createNotesSeeder', 'importNotesFromData', 'NotesEARS', 'createSettingsSeeder'],
  },
};

let consumer: string | undefined;
beforeAll(() => {
  if (PACKAGES_BUILT) consumer = installPublishedPackages();
}, 120_000);
afterAll(() => {
  if (consumer) fs.rmSync(consumer, { recursive: true, force: true });
});

/** `<subpath> <export>` for each pack-facing export whose type contains `any` */
function exportsWithAny(sdkDir: string): string[] {
  const manifest = JSON.parse(fs.readFileSync(path.join(sdkDir, 'package.json'), 'utf-8'));
  const entries = Object.entries(manifest.exports as Record<string, unknown>)
    .filter(([key, target]) => key !== './ears/internals' && typeof target === 'object' && target !== null && 'types' in target)
    .map(([key, target]) => [key, path.join(sdkDir, (target as { types: string }).types)] as const);
  const program = ts.createProgram(entries.map(([, file]) => file), {
    strict: true, skipLibCheck: true, noEmit: true, types: ['node'],
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  });
  const checker = program.getTypeChecker();
  const sdkRoot = fs.realpathSync(sdkDir);
  const thirdParty = (node: ts.Node) => {
    const file = node.getSourceFile().fileName;
    return /\/node_modules\//.test(file) && !fs.realpathSync(file).startsWith(sdkRoot + path.sep);
  };

  function containsAny(type: ts.Type, seen: Set<ts.Type>, depth: number): boolean {
    if (type.flags & ts.TypeFlags.Any) return true;
    if (seen.has(type) || depth > 6) return false;
    seen.add(type);
    if (type.isUnionOrIntersection()) return type.types.some((t) => containsAny(t, seen, depth + 1));
    for (const signature of [...type.getCallSignatures(), ...type.getConstructSignatures()]) {
      if (containsAny(signature.getReturnType(), seen, depth + 1)) return true;
      if (signature.getParameters().some((p) => containsAny(checker.getTypeOfSymbol(p), seen, depth + 1))) return true;
    }
    if (!(type.flags & ts.TypeFlags.Object)) return false;
    if ((type as ts.TypeReference).target && checker.getTypeArguments(type as ts.TypeReference).some((t) => containsAny(t, seen, depth + 1))) return true;
    if (checker.getIndexInfosOfType(type).some((info) => containsAny(info.type, seen, depth + 1))) return true;
    return type.getProperties().some((property) => {
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      return !(declaration && thirdParty(declaration)) && containsAny(checker.getTypeOfSymbol(property), seen, depth + 1);
    });
  }

  const found: string[] = [];
  for (const [key, file] of entries) {
    const module = checker.getSymbolAtLocation(program.getSourceFile(file)!);
    for (const symbol of module ? checker.getExportsOfModule(module) : []) {
      const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      const declaration = target.declarations?.[0];
      if (!declaration || thirdParty(declaration)) continue;
      const type = target.flags & ts.SymbolFlags.Type && !(target.flags & ts.SymbolFlags.Value)
        ? checker.getDeclaredTypeOfSymbol(target)
        : checker.getTypeOfSymbolAtLocation(target, declaration);
      if (containsAny(type, new Set(), 0)) found.push(`${key} ${symbol.name}`);
    }
  }
  return found;
}

describe.skipIf(!PACKAGES_BUILT)('published @abuddy/sdk', () => {
  it('exposes no any outside the listed exports', () => {
    const found = exportsWithAny(path.join(consumer!, 'node_modules', '@abuddy', 'sdk'));
    const allowed = new Set(Object.entries(ALLOWED_ANY).flatMap(([key, { exports }]) => exports.map((name) => `${key} ${name}`)));
    expect(found.filter((entry) => !allowed.has(entry)), 'exports newly exposing any').toEqual([]);
    expect([...allowed].filter((entry) => !found.includes(entry)), 'listed exports without any (remove them from ALLOWED_ANY)').toEqual([]);
  }, 120_000);
});
