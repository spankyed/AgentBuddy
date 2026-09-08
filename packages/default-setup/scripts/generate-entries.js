#!/usr/bin/env node

/**
 * Generates pack entries and mechanical registries from abuddy.json.
 *
 * Run: node scripts/generate-entries.js
 *
 * The manifest's `features` array is the source of truth for which
 * systems and plugins exist. This script produces the import graph
 * that wires them into the pack registration at build time.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'abuddy.json'), 'utf-8'));

const HEADER = `// @generated from abuddy.json — do not edit by hand
// Regenerate: node scripts/generate-entries.js\n`;

function toImportPath(manifestPath) {
  return '../' + manifestPath.replace(/^src\//, '').replace(/\.ts$/, '');
}

function toPascalCase(id) {
  return id.replace(/(^|-)(\w)/g, (_, _sep, c) => c.toUpperCase());
}

function resolveServiceImport(key, manifestPath) {
  const base = join(root, manifestPath);
  const fullPath = existsSync(base + '.ts') ? base + '.ts'
    : existsSync(join(base, 'index.ts')) ? join(base, 'index.ts')
    : base;
  const content = readFileSync(fullPath, 'utf-8');
  const pascal = toPascalCase(key);
  const factoryName = `create${pascal}Service`;
  const namedName = `${key}Service`;

  if (content.includes(`export const ${factoryName}`) || content.includes(`export function ${factoryName}`)) {
    return { style: 'factory', exportName: factoryName };
  }
  if (content.includes(`export const ${namedName}`) || content.includes(`export function ${namedName}`)) {
    return { style: 'named', exportName: namedName };
  }
  return { style: 'namespace' };
}

function outgoingEventsType(feature) {
  return feature.system?.outgoingEventsType ?? `Outgoing${toPascalCase(feature.id)}Events`;
}

function typesEntry(feature) {
  return feature.typesEntry ?? `src/features/${feature.id}/be/types`;
}

// ── Backend entry ──────────────────────────────────────────────

function generateBackendEntry() {
  const features = manifest.features ?? [];
  const regularFeatures = features.filter(f => !f.earlySystem);
  const earlyFeature = features.find(f => f.earlySystem);

  // Settings must be first — other systems reference it during initial state.
  const systemFeatures = regularFeatures.filter(f => f.system);
  const settingsFirst = systemFeatures.filter(f => f.designation === 'settings');
  const rest = systemFeatures.filter(f => f.designation !== 'settings');
  const orderedSystemFeatures = [...settingsFirst, ...rest];

  const systemImports = orderedSystemFeatures
    .map(f => `import { ${f.system.exportName} } from '${toImportPath(f.system.entry)}';`)
    .join('\n');

  const systemEntries = orderedSystemFeatures
    .map(f => f.system.exportName)
    .join(', ');

  const earlyImport = earlyFeature
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

  const earlySystemLine = earlyFeature
    ? `    earlySystem: ${earlyFeature.system.exportName}.machine,`
    : '';

  const bootImports = [
    `import { createDefaultSettings } from '${toImportPath(manifest.boot.createDefaultSettings)}';`,
    `import { terminalService } from '${toImportPath(manifest.boot.shutdown)}';`,
  ].join('\n');

  return `${HEADER}
import type { PackRegistration } from '@abuddy/sdk/framework';
import { toPackSystemDefs } from '@abuddy/sdk/framework';

${systemImports}
${earlyImport}
import { featureServices } from './services';
import { EARS } from './ears';
${bootImports}
import { runBootSeed } from '../registries/seed/index';
import { migrations } from '../migrations';
import { standardSteps } from '../steps/register';
import { standardArtifacts } from '../artifacts/register';
import { standardBlocks } from '../blocks/register';

export const registration: PackRegistration = {
  id: '${manifest.id}',
  systems: toPackSystemDefs([${systemEntries}]),
  services: featureServices,
  steps: standardSteps,
  artifacts: standardArtifacts,
  blocks: standardBlocks,
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
    seed: runBootSeed,
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

function generateFrontendEntry() {
  const features = manifest.features ?? [];
  const pluginFeatures = features.filter(f => f.plugin);

  const pluginImports = pluginFeatures
    .map(f => `import ${toPascalCase(f.id)} from '${toImportPath(f.plugin.entry)}';`)
    .join('\n');

  const pluginList = pluginFeatures.map(f => toPascalCase(f.id)).join(', ');
  const defaultId = manifest.defaultPlugin;
  const defaultFeature = defaultId ? pluginFeatures.find(f => f.id === defaultId) : pluginFeatures[0];
  const defaultPluginId = defaultFeature ? toPascalCase(defaultFeature.id) : 'undefined';

  return `${HEADER}
import { registerPackFE } from '@abuddy/sdk/fe';
${pluginImports}
import { tiptapPlugins } from '../registries/tiptap-plugins';
import { artifactDefinitions } from '../artifacts/register-fe';
import { blockDefinitions } from '../blocks/register-fe';
import { standardStepsFE } from '../steps/register-fe';
import Welcome from '../extensions/Welcome.vue';

registerPackFE({
  plugins: [${pluginList}],
  defaultPlugin: ${defaultPluginId},
  steps: standardStepsFE,
  tiptapPlugins,
  appExtensions: { welcome: Welcome },
  artifacts: artifactDefinitions,
  blocks: blockDefinitions,
});
`;
}

// ── Registries ────────────────────────────────────────────────

function generateEars() {
  return `${HEADER}
export { EARS, type BaseEntity, AllEntities } from '../../.abuddy/generated/ears';
`;
}

function generateSystemIds() {
  const features = manifest.features ?? [];
  const systemFeatures = features.filter(f => f.system);

  const exports = systemFeatures
    .map(f => `export { ${f.id} } from '${toImportPath(f.system.entry)}';`)
    .join('\n');

  return `${HEADER}
${exports}
`;
}

function generateEventChannels() {
  const features = manifest.features ?? [];
  const systemFeatures = features.filter(f => f.system);

  const imports = systemFeatures
    .map(f => `import type { ${outgoingEventsType(f)} } from '${toImportPath(f.system.entry)}';`)
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

function generateTypes() {
  const features = manifest.features ?? [];
  const systemFeatures = features.filter(f => f.system);

  const perFeature = systemFeatures.map(f => {
    const eventsLine = `export type { ${outgoingEventsType(f)} } from '${toImportPath(f.system.entry)}';`;
    const typesPath = typesEntry(f);
    const fullTypesPath = join(root, typesPath) + (typesPath.endsWith('.ts') ? '' : '.ts');
    const hasTypes = existsSync(fullTypesPath);
    const typesLine = hasTypes ? `export type * from '${toImportPath(typesPath)}';` : '';
    return typesLine ? `${eventsLine}\n${typesLine}` : eventsLine;
  }).join('\n\n');

  return `${HEADER}
export type { EARS } from '@abuddy/sdk';
export type { SetupPackPreview, SetupPackPreviewItem, SetupPackType } from '@abuddy/sdk/build';

${perFeature}
`;
}

function generateServices() {
  const features = manifest.features ?? [];
  const packServices = manifest.packServices ?? {};
  const imports = [];
  const entries = [];

  function addService(key, manifestPath) {
    const { style, exportName } = resolveServiceImport(key, manifestPath);
    const path = toImportPath(manifestPath);
    if (style === 'factory') {
      imports.push(`import { ${exportName} } from '${path}';`);
      entries.push(`  ${key}: ${exportName}(),`);
    } else if (style === 'named') {
      imports.push(`import { ${exportName} } from '${path}';`);
      entries.push(`  ${key}: ${exportName},`);
    } else {
      imports.push(`import * as ${key} from '${path}';`);
      entries.push(`  ${key},`);
    }
  }

  for (const f of features) {
    for (const [key, path] of Object.entries(f.services)) {
      addService(key, path);
    }
  }

  for (const [key, path] of Object.entries(packServices)) {
    addService(key, path);
  }

  return `${HEADER}
${imports.join('\n')}

export const featureServices = {
${entries.join('\n')}
};
`;
}

function generateServiceTypes() {
  return `${HEADER}
import type { featureServices } from './services';

type FeatureServices = typeof featureServices;

declare module '@abuddy/sdk/types' {
  interface ServiceRegistry extends FeatureServices {}
}

export {};
`;
}

// ── Write ──────────────────────────────────────────────────────

mkdirSync(join(root, 'src/__generated__'), { recursive: true });

const files = [
  ['src/__generated__/pack-entry.ts', generateBackendEntry()],
  ['src/__generated__/pack-entry-fe.ts', generateFrontendEntry()],
  ['src/__generated__/ears.ts', generateEars()],
  ['src/__generated__/system-ids.ts', generateSystemIds()],
  ['src/__generated__/event-channels.ts', generateEventChannels()],
  ['src/__generated__/types.ts', generateTypes()],
  ['src/__generated__/services.ts', generateServices()],
  ['src/__generated__/service-types.ts', generateServiceTypes()],
];

for (const [path, content] of files) {
  writeFileSync(join(root, path), content);
}

console.log('Generated:');
for (const [path] of files) {
  console.log(`  ${path}`);
}
