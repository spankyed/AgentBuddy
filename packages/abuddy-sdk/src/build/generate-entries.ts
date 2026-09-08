import { readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import type { PackManifest, PackFeatureEntry, SeedEntryConfig, StepEntry } from './manifest';

const HEADER = `// @generated from abuddy.json — do not edit by hand
// Regenerate: abuddy generate-entries\n`;

function toImportPath(manifestPath: string): string {
  return '../' + manifestPath.replace(/^src\//, '').replace(/\.ts$/, '');
}

function toPascalCase(id: string): string {
  return id.replace(/(^|-)(\w)/g, (_, _sep, c) => c.toUpperCase());
}

export interface GenerateEntriesOptions {
  packRoot: string;
}

export function generatePackFiles(
  manifest: PackManifest,
  opts: GenerateEntriesOptions,
): Record<string, string> {
  const root = opts.packRoot;

  function resolveServiceImport(key: string, manifestPath: string) {
    const base = join(root, manifestPath);
    const fullPath = existsSync(base + '.ts') ? base + '.ts'
      : existsSync(join(base, 'index.ts')) ? join(base, 'index.ts')
      : null;
    if (!fullPath) {
      throw new Error(`Service "${key}": no file found at ${manifestPath} (.ts or /index.ts)`);
    }
    const content = readFileSync(fullPath, 'utf-8');
    const pascal = toPascalCase(key);
    const factoryName = `create${pascal}Service`;
    const namedName = `${key}Service`;
    const exportPattern = (name: string) => new RegExp(`export\\s+(const|function)\\s+${name}\\b`);

    if (exportPattern(factoryName).test(content)) {
      return { style: 'factory' as const, exportName: factoryName };
    }
    if (exportPattern(namedName).test(content)) {
      return { style: 'named' as const, exportName: namedName };
    }
    return { style: 'namespace' as const, exportName: key };
  }

  function outgoingEventsType(feature: PackFeatureEntry): string {
    return feature.system?.outgoingEventsType ?? `Outgoing${toPascalCase(feature.id)}Events`;
  }

  function typesEntry(feature: PackFeatureEntry): string {
    return feature.typesEntry ?? `src/features/${feature.id}/be/types`;
  }

  const stepsRegister = typeof manifest.steps === 'string'
    ? manifest.steps
    : manifest.steps?.register;

  const stepDefinitions: StepEntry[] = (typeof manifest.steps === 'object' && manifest.steps !== null)
    ? manifest.steps.definitions
    : [];

  // ── Backend entry ──────────────────────────────────────────────

  function generateBackendEntry(): string {
    const features = manifest.features ?? [];
    const regularFeatures = features.filter(f => !f.earlySystem);
    const earlyFeature = features.find(f => f.earlySystem);

    const systemFeatures = regularFeatures.filter(f => f.system);
    const settingsFirst = systemFeatures.filter(f => f.designation === 'settings');
    const rest = systemFeatures.filter(f => f.designation !== 'settings');
    const orderedSystemFeatures = [...settingsFirst, ...rest];

    const systemImports = orderedSystemFeatures
      .map(f => `import { ${f.system!.exportName} } from '${toImportPath(f.system!.entry)}';`)
      .join('\n');

    const systemEntries = orderedSystemFeatures
      .map(f => f.system!.exportName)
      .join(', ');

    const earlyImport = earlyFeature?.system
      ? `import { ${earlyFeature.system.exportName} } from '${toImportPath(earlyFeature.system.entry)}';\n`
      : '';

    const featuresLiteral = features.map(f => {
      const parts = [`    id: '${f.id}'`];
      parts.push(`    hasSystem: ${!!f.system}`);
      if (f.designation) parts.push(`    designation: '${f.designation}'`);
      if (f.plugin) {
        const pluginParts = [`label: '${f.plugin.label}'`, `icon: '${f.plugin.icon}'`];
        if (f.plugin.isPinned) pluginParts.push(`isPinned: true`);
        parts.push(`    plugin: { ${pluginParts.join(', ')} }`);
      }
      parts.push(`    services: [${Object.keys(f.services).map(s => `'${s}'`).join(', ')}]`);
      return `  {\n${parts.join(',\n')},\n  }`;
    }).join(',\n');

    const earlySystemLine = earlyFeature?.system
      ? `    earlySystem: ${earlyFeature.system.exportName}.machine,`
      : '';

    const bootImports = [
      `import { createDefaultSettings } from '${toImportPath(manifest.boot!.createDefaultSettings!)}';`,
      `import { terminalService } from '${toImportPath(manifest.boot!.shutdown!)}';`,
    ].join('\n');

    const seed = manifest.boot?.seed ?? {};
    const seedKeys = Object.keys(seed).filter(k => k !== 'settings' && k !== 'faqs');
    const artifactsList = seedKeys.map(k => `'${k}'`).join(', ');
    const seedPolicy = manifest.boot?.seedPolicy;
    const seedPolicyLine = seedPolicy ? `\n      seedPolicy: ${JSON.stringify(seedPolicy)},` : '';

    return `${HEADER}
import type { PackRegistration } from '@abuddy/sdk/framework';
import { toPackSystemDefs } from '@abuddy/sdk/framework';

${systemImports}
${earlyImport}
import { featureServices } from './services';
import { EARS } from './ears';
${bootImports}
import './seeders';
import { migrations } from '${toImportPath(manifest.migrations!)}';
import { steps } from '${toImportPath(stepsRegister!)}';
import { artifacts } from '${toImportPath(manifest.artifacts!)}';
import { blocks } from '${toImportPath(manifest.blocks!)}';
import { DEFAULT_COMPILED_DIR } from './seeders';

export const registration: PackRegistration = {
  id: '${manifest.id}',
  systems: toPackSystemDefs([${systemEntries}]),
  services: featureServices,
  steps,
  artifacts,
  blocks,
  ears: {
    entities: Object.fromEntries(
      Object.entries(EARS.Entity).filter(([k, v]) => typeof v === 'string' && k !== 'Custom') as [string, string][]
    ),
    relKinds: Object.fromEntries(
      Object.entries(EARS.RelKind).filter(([k, v]) => typeof v === 'string' && k !== 'Custom') as [string, string][]
    ),
    partitionPolicy: {
      excludedEntityTypes: ${JSON.stringify(manifest.partitionPolicy?.excludedEntityTypes ?? [])},
      secretEntityTypes: ${JSON.stringify(manifest.partitionPolicy?.secretEntityTypes ?? [])},
    },
  },
  boot: {
${earlySystemLine}
    createDefaultSettings,
    seedManifest: {
      artifacts: [${artifactsList}],
      compiledDir: DEFAULT_COMPILED_DIR,${seedPolicyLine}
    },
    shutdown: () => terminalService.killAll(),
  },
  migrations,
  features: [
${featuresLiteral},
  ],
};
`;
  }

  // ── Frontend entry ─────────────────────────────────────────────

  function generateFrontendEntry(): string {
    const features = manifest.features ?? [];
    const pluginFeatures = features.filter(f => f.plugin);

    const pluginImports = pluginFeatures
      .map(f => `import ${toPascalCase(f.id)} from '${toImportPath(f.plugin!.entry)}';`)
      .join('\n');

    const pluginList = pluginFeatures.map(f => toPascalCase(f.id)).join(', ');
    const defaultId = manifest.defaultPlugin;
    const defaultFeature = defaultId ? pluginFeatures.find(f => f.id === defaultId) : pluginFeatures[0];
    const defaultPluginId = defaultFeature ? toPascalCase(defaultFeature.id) : 'undefined';

    const fe = manifest.fe ?? {};

    const feExts: Record<string, string> = {};
    for (const field of ['steps', 'artifacts', 'blocks'] as const) {
      const manifestField = manifest[field];
      if (!manifestField) continue;
      const pathStr = typeof manifestField === 'string' ? manifestField : manifestField.register;
      const fePath = pathStr.replace(/\.ts$/, '-fe.ts');
      if (!existsSync(join(root, fePath))) continue;
      feExts[field] = toImportPath(fePath);
    }

    const extraImports: string[] = [];
    if (fe.tiptapPlugins) {
      extraImports.push(`import { tiptapPlugins } from '${toImportPath(fe.tiptapPlugins)}';`);
    }
    for (const field of ['artifacts', 'blocks', 'steps'] as const) {
      if (feExts[field]) {
        extraImports.push(`import { ${field}FE } from '${feExts[field]}';`);
      }
    }
    const appExt = Object.entries(fe.appExtensions ?? {});
    for (const [key, extPath] of appExt) {
      extraImports.push(`import ${toPascalCase(key)} from '${toImportPath(extPath)}';`);
    }

    const regProps: string[] = [];
    if (feExts.steps) regProps.push(`  steps: stepsFE,`);
    if (fe.tiptapPlugins) regProps.push(`  tiptapPlugins,`);
    if (appExt.length) {
      const extObj = appExt.map(([key]) => `${key}: ${toPascalCase(key)}`).join(', ');
      regProps.push(`  appExtensions: { ${extObj} },`);
    }
    if (feExts.artifacts) regProps.push(`  artifacts: artifactsFE,`);
    if (feExts.blocks) regProps.push(`  blocks: blocksFE,`);

    return `${HEADER}
import { registerPackFE } from '@abuddy/sdk/fe';
${pluginImports}
${extraImports.join('\n')}

registerPackFE({
  plugins: [${pluginList}],
  defaultPlugin: ${defaultPluginId},
${regProps.join('\n')}
});
`;
  }

  // ── Registries ────────────────────────────────────────────────

  function generateEars(): string {
    return `${HEADER}
export { EARS, type BaseEntity, AllEntities } from '../../.abuddy/generated/ears';
`;
  }

  function generateSystemIds(): string {
    const features = manifest.features ?? [];
    const systemFeatures = features.filter(f => f.system);

    const exports = systemFeatures
      .map(f => `export { ${f.id} } from '${toImportPath(f.system!.entry)}';`)
      .join('\n');

    return `${HEADER}
${exports}
`;
  }

  function generateEventChannels(): string {
    const features = manifest.features ?? [];
    const systemFeatures = features.filter(f => f.system);

    const imports = systemFeatures
      .map(f => `import type { ${outgoingEventsType(f)} } from '${toImportPath(f.system!.entry)}';`)
      .join('\n');

    const entries = systemFeatures
      .map(f => `    '${f.id}': ${outgoingEventsType(f)};`)
      .join('\n');

    return `${HEADER}
${imports}

declare module '@abuddy/sdk/types' {
  interface PluginEventRegistry {
${entries}
  }
}

export {};
`;
  }

  function generateTypes(): string {
    const features = manifest.features ?? [];
    const systemFeatures = features.filter(f => f.system);

    const perFeature = systemFeatures.map(f => {
      const lines: string[] = [];
      lines.push(`export type { ${outgoingEventsType(f)} } from '${toImportPath(f.system!.entry)}';`);
      const tPath = typesEntry(f);
      const fullTypesPath = join(root, tPath) + (tPath.endsWith('.ts') ? '' : '.ts');
      if (existsSync(fullTypesPath)) {
        lines.push(`export type * from '${toImportPath(tPath)}';`);
      }
      const exportTypesPath = tPath.replace(/types$/, 'export-types');
      const fullExportTypesPath = join(root, exportTypesPath) + '.ts';
      if (existsSync(fullExportTypesPath)) {
        lines.push(`export type * from '${toImportPath(exportTypesPath)}';`);
      }
      return lines.join('\n');
    }).join('\n\n');

    return `${HEADER}
export type { EARS } from '@abuddy/sdk';
export type { PackSeedsPreview, PackSeedPreviewItem, PackSeedType } from '@abuddy/sdk/build';

${perFeature}
`;
  }

  function generateServices(): string {
    const features = manifest.features ?? [];
    const packServices = manifest.packServices ?? {};
    const imports: string[] = [];
    const entries: string[] = [];

    function addService(key: string, manifestPath: string) {
      const { style, exportName } = resolveServiceImport(key, manifestPath);
      const importPath = toImportPath(manifestPath);
      if (style === 'factory') {
        imports.push(`import { ${exportName} } from '${importPath}';`);
        entries.push(`  ${key}: ${exportName}(),`);
      } else if (style === 'named') {
        imports.push(`import { ${exportName} } from '${importPath}';`);
        entries.push(`  ${key}: ${exportName},`);
      } else {
        imports.push(`import * as ${key} from '${importPath}';`);
        entries.push(`  ${key},`);
      }
    }

    for (const f of features) {
      for (const [key, svcPath] of Object.entries(f.services)) {
        addService(key, svcPath);
      }
    }

    for (const [key, svcPath] of Object.entries(packServices)) {
      addService(key, svcPath);
    }

    return `${HEADER}
import type { z } from 'zod';
import type { EARS } from '@abuddy/sdk';
${imports.join('\n')}

export const featureServices = {
${entries.join('\n')}
};

export type Services = typeof featureServices;
export type Z = typeof z;
export type EntityId = EARS.EntityId;
`;
  }

  function generateContributions(): string {
    const features = manifest.features ?? [];
    const contribFeatures = features.filter(f => f.contributions);

    const imports = contribFeatures.map((f, i) => {
      const importPath = toImportPath(f.contributions!);
      return `import { contributionTypes as types${i}, categories as categories${i}, itemsProvider as itemsProvider${i} } from '${importPath}';`;
    }).join('\n');

    const typesSpread = contribFeatures.map((_, i) => `  ...types${i},`).join('\n');
    const categoriesSpread = contribFeatures.map((_, i) => `  ...categories${i},`).join('\n');
    const providersEntries = contribFeatures.map((_, i) => `  itemsProvider${i},`).join('\n');

    return `${HEADER}
import type { ContributionTypeConfig, CategoryConfig, CategoryItemsProvider } from '@abuddy/sdk/fe/contributions';
${imports}

export const CONTRIBUTION_TYPES: Record<string, ContributionTypeConfig> = {
${typesSpread}
};

export const CATEGORIES: CategoryConfig[] = [
${categoriesSpread}
];

export const ITEMS_PROVIDERS: CategoryItemsProvider[] = [
${providersEntries}
];

export const PROTOCOL_TO_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(CONTRIBUTION_TYPES).map(([type, cfg]) => [cfg.protocol, type])
);

export const ALL_PROTOCOLS: string[] = Object.values(CONTRIBUTION_TYPES).map((cfg) => cfg.protocol);

export function categoryOfType(type: string): string {
  return CONTRIBUTION_TYPES[type]?.category ?? '';
}

export type { ContributionTypeConfig, CategoryConfig, CategoryItemsProvider } from '@abuddy/sdk/fe/contributions';
`;
  }

  function generateSeeders(): string {
    const seed = manifest.boot?.seed;
    if (!seed || typeof seed !== 'object') return '';

    const seedImports = new Set<string>();
    const packImports: string[] = [];
    const registrations: string[] = [];

    const COLLECTION_DEFAULTS: Record<string, { entityType: string; lookupField: string }> = {
      actions: { entityType: 'Action', lookupField: 'label' },
      prompts: { entityType: 'Prompt', lookupField: 'label' },
    };

    for (const [key, value] of Object.entries(seed)) {
      const config: SeedEntryConfig = typeof value === 'string' ? {} : value;
      const customSeeder = config.seeder;

      if (customSeeder) {
        const importName = `${key}Seeder`;
        packImports.push(`import { seed as ${importName} } from '${toImportPath(customSeeder)}';`);
        registrations.push(`registerSeeder({ key: '${key}', seed: ${importName} });`);
        continue;
      }

      if (key in COLLECTION_DEFAULTS || config.entityType) {
        const defaults = COLLECTION_DEFAULTS[key] ?? {} as Partial<{ entityType: string; lookupField: string }>;
        const entityType = config.entityType ?? defaults.entityType;
        const lookupField = config.lookupField ?? defaults.lookupField;
        if (!entityType || !lookupField) {
          throw new Error(`Seed "${key}": collection seeder requires entityType and lookupField`);
        }
        seedImports.add('createCollectionSeeder');
        registrations.push(
          `registerSeeder(createCollectionSeeder({ key: '${key}', entityType: EARS.Entity.${entityType}, lookupField: '${lookupField}' }));`
        );
        continue;
      }

      const SEEDER_FACTORIES: Record<string, string> = {
        flows: 'createFlowSeeder',
        library: 'createLibrarySeeder',
        notes: 'createNotesSeeder',
        settings: 'createSettingsSeeder',
      };

      const factory = SEEDER_FACTORIES[key];
      if (factory) {
        seedImports.add(factory);
        if (key === 'settings') {
          registrations.push(`registerSeeder(${factory}());`);
        } else {
          registrations.push(`registerSeeder(${factory}(EARS));`);
        }
        continue;
      }

      if (key === 'faqs') continue;

      throw new Error(`Seed "${key}": unknown standard seed type and no "seeder" path provided`);
    }

    return `${HEADER}
import path from 'path';
import { ${Array.from(seedImports).join(', ')} } from '@abuddy/sdk/seed';
import { registerSeeder, seedData, type SeedCounts, type SeedIncludeSet } from '@abuddy/sdk/utils';
import { EARS } from './ears';
${packImports.join('\n')}

export const DEFAULT_COMPILED_DIR = path.resolve(process.cwd(), '..', '${basename(root)}', 'dist');

${registrations.join('\n')}

export { seedData };
export type { SeedCounts, SeedIncludeSet };
export type { ImportMode } from '@abuddy/sdk/utils';
`;
  }

  function generateEntityShapes(): string {
    const shapes = manifest.entityShapes;
    if (!shapes || Object.keys(shapes).length === 0) return '';

    const sourceGroups = new Map<string, { entity: string; typeName: string }[]>();
    for (const [entity, { source, type: typeName }] of Object.entries(shapes)) {
      const importPath = toImportPath(source);
      if (!sourceGroups.has(importPath)) sourceGroups.set(importPath, []);
      sourceGroups.get(importPath)!.push({ entity, typeName });
    }

    const imports = Array.from(sourceGroups.entries()).map(([importPath, types]) => {
      const names = [...new Set(types.map(t => t.typeName))].join(', ');
      return `import type { ${names} } from '${importPath}';`;
    }).join('\n');

    const entries = Object.entries(shapes).map(([entity, { type: typeName }]) =>
      `    '${entity}': Attrs<${typeName}>;`
    ).join('\n');

    return `${HEADER}
import type { BaseEntity } from '@abuddy/sdk/types';
${imports}

type Attrs<T> = Omit<T, keyof BaseEntity>;

declare module '@abuddy/sdk/types' {
  interface EntityShapeRegistry {
${entries}
  }
}

export {};
`;
  }

  function generateServiceTypes(): string {
    return `${HEADER}
import type { featureServices } from './services';

type FeatureServices = typeof featureServices;

declare module '@abuddy/sdk/types' {
  interface ServiceRegistry extends FeatureServices {}
}

export {};
`;
  }

  // ── Flow helpers ───────────────────────────────────────────────

  function toCamelCase(s: string): string {
    return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  }

  function generateFlowHelpers(): string {
    if (stepDefinitions.length === 0) return '';

    const imports: string[] = [];
    const helpers: string[] = [];
    const customReExports: string[] = [];

    for (const step of stepDefinitions) {
      if (!step.dsl) continue;

      const dsl = step.dsl;
      const name = toCamelCase(step.type);

      if (dsl.custom) {
        customReExports.push(`export * from '${toImportPath(step.path + '/helpers')}';`);
        continue;
      }

      const importPath = toImportPath(step.path + '/types');

      if (dsl.primaryField) {
        const typesFile = join(root, step.path, 'types.ts');
        const content = existsSync(typesFile) ? readFileSync(typesFile, 'utf-8') : '';
        const dslMatch = content.match(/export\s+interface\s+(DSL\w+Node)\b/);
        if (!dslMatch) {
          throw new Error(`Step "${step.type}": no DSL*Node interface found in ${step.path}/types.ts`);
        }
        const dslTypeName = dslMatch[1];
        imports.push(`import type { ${dslTypeName} } from '${importPath}';`);
        helpers.push(
`export function ${name}(${dsl.primaryField}: string, opts?: Omit<${dslTypeName}, 'type' | '${dsl.primaryField}'>): DSLStepNode {
  return { type: '${step.type}', ${dsl.primaryField}, ...opts };
}`
        );
      } else if (dsl.defaultLabel) {
        helpers.push(
`export function ${name}(label: string = '${dsl.defaultLabel}'): DSLStepNode {
  return { type: '${step.type}', label };
}`
        );
      } else {
        helpers.push(
`export function ${name}(label?: string): DSLStepNode {
  return { type: '${step.type}', ...(label && { label }) };
}`
        );
      }
    }

    // Trigger track builders
    for (const step of stepDefinitions) {
      if (step.kind !== 'trigger') continue;
      const defFile = join(root, step.path, 'index.ts');
      if (!existsSync(defFile)) continue;
      const content = readFileSync(defFile, 'utf-8');
      const match = content.match(/trackField:\s*['"](\w+)['"]/);
      if (!match) continue;
      const trackField = match[1];
      if (trackField === 'event') continue;
      helpers.push(
`export function ${toCamelCase(trackField)}(${trackField}: string, exits: DSLStepNode[][], label?: string): Track {
  return { ${trackField}, label: label ?? \`${toPascalCase(trackField)} (\${${trackField}})\`, exits };
}`
      );
    }

    return `${HEADER}
import type { DSLStepNode, Track } from '@abuddy/sdk/build';
export { entry, on } from '@abuddy/sdk/build';
${imports.join('\n')}

${helpers.join('\n\n')}
${customReExports.length ? '\n' + customReExports.join('\n') : ''}
`;
  }

  function generateStepTypes(): string {
    if (!stepDefinitions.length) return '';
    const reExports = stepDefinitions
      .filter(step => existsSync(join(root, step.path, 'types.ts')))
      .map(step => `export type * from '${toImportPath(step.path + '/types')}';`);
    if (!reExports.length) return '';
    return `${HEADER}\n${reExports.join('\n')}\n`;
  }

  // ── Assemble ────────────────────────────────────────────────────

  const files: [string, string][] = ([
    ['src/__generated__/pack-entry.ts', generateBackendEntry()],
    ['src/__generated__/pack-entry-fe.ts', generateFrontendEntry()],
    ['src/__generated__/ears.ts', generateEars()],
    ['src/__generated__/system-ids.ts', generateSystemIds()],
    ['src/__generated__/event-channels.ts', generateEventChannels()],
    ['src/__generated__/types.ts', generateTypes()],
    ['src/__generated__/services.ts', generateServices()],
    ['src/__generated__/entity-shapes.ts', generateEntityShapes()],
    ['src/__generated__/service-types.ts', generateServiceTypes()],
    ['src/__generated__/contributions.ts', generateContributions()],
    ['src/__generated__/seeders.ts', generateSeeders()],
    ['src/__generated__/flow-helpers.ts', generateFlowHelpers()],
    ['src/__generated__/step-types.ts', generateStepTypes()],
  ] as [string, string][]).filter(([, content]) => content);

  return Object.fromEntries(files);
}
