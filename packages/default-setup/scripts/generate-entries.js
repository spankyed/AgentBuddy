#!/usr/bin/env node

/**
 * Generates pack-entry.ts and pack-entry-fe.ts from abuddy.json.
 *
 * Run: node scripts/generate-entries.js
 *
 * The manifest's `features` array is the source of truth for which
 * systems and plugins exist. This script produces the import graph
 * that wires them into the pack registration at build time.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'abuddy.json'), 'utf-8'));

function toImportPath(manifestPath) {
  return '../' + manifestPath.replace(/^src\//, '').replace(/\.ts$/, '');
}

function toPascalCase(id) {
  return id.replace(/(^|-)(\w)/g, (_, _sep, c) => c.toUpperCase());
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
    parts.push(`    services: [${f.services.map(s => `'${s}'`).join(', ')}]`);
    return `  {\n${parts.join(',\n')},\n  }`;
  }).join(',\n');

  const earlySystemLine = earlyFeature
    ? `    earlySystem: ${earlyFeature.system.exportName}.machine,`
    : '';

  return `// @generated from abuddy.json — do not edit by hand
// Regenerate: node scripts/generate-entries.js

import type { PackRegistration } from '@abuddy/sdk/framework';
import { toPackSystemDefs } from '@abuddy/sdk/framework';

${systemImports}
${earlyImport}
import { featureServices } from '../registries/services';
import { EARS } from '../registries/ears';
import { createDefaultSettings, shutdownHook } from '../registries/boot';
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
    shutdown: shutdownHook,
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

  return `// @generated from abuddy.json — do not edit by hand
// Regenerate: node scripts/generate-entries.js

import { registerPackFE } from '@abuddy/sdk/fe';
${pluginImports}
import { tiptapPlugins } from '../registries/tiptap-plugins';
import { artifactDefinitions } from '../artifacts/register-fe';
import { blockDefinitions } from '../blocks/register-fe';
import { standardSteps } from '../steps/register';
import Welcome from '../extensions/Welcome.vue';

registerPackFE({
  plugins: [${pluginList}],
  defaultPlugin: ${defaultPluginId},
  steps: standardSteps,
  tiptapPlugins,
  appExtensions: { welcome: Welcome },
  artifacts: artifactDefinitions,
  blocks: blockDefinitions,
});
`;
}

// ── Write ──────────────────────────────────────────────────────

const beContent = generateBackendEntry();
const feContent = generateFrontendEntry();

import { mkdirSync } from 'fs';
mkdirSync(join(root, 'src/__generated__'), { recursive: true });

writeFileSync(join(root, 'src/__generated__/pack-entry.ts'), beContent);
writeFileSync(join(root, 'src/__generated__/pack-entry-fe.ts'), feContent);

console.log('Generated:');
console.log('  src/__generated__/pack-entry.ts');
console.log('  src/__generated__/pack-entry-fe.ts');
