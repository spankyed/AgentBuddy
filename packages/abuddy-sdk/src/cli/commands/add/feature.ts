import * as path from 'node:path';
import { generateEntries } from '../generate-entries';
import { validateName, toPascalCase, toCamelCase, toLabel, writeIfNotExists, logCreated, parseFlag } from './templates';
import { readManifest, writeManifest, addFeature as addFeatureToManifest } from './manifest';

const FEATURE_CONFIG = (name: string, designation?: string) => {
  const desig = designation ? `\n  designation: '${designation}',` : '';
  return `import type { FeatureConfig } from '@abuddy/sdk/build';

export default {
  name: '${name}',${desig}
  settings: './settings.ts',
} satisfies FeatureConfig;
`;
};

const SETTINGS = (id: string) => `export default {
  plugins: {
    _meta: { visibility: { ${id}: true } },
    ${id}: {}
  }
}
`;

const SYSTEM = (name: string, camel: string, pascal: string) => `import { setup } from 'xstate';
import { defineSystem, type SystemEntry } from '@abuddy/sdk/framework';
import { bus } from '@abuddy/sdk/ids';
import { emit } from '@abuddy/sdk/helpers';

type Incoming${pascal}Events =
  | { type: 'CLIENT_CONNECTED' };

export type Outgoing${pascal}Events =
  | { type: '${name.toUpperCase().replace(/-/g, '_')}_CONNECTED'; data: Record<string, unknown> };

export const ${camel}Spec = defineSystem('${name}')<Incoming${pascal}Events, Outgoing${pascal}Events>();
export const ${camel} = ${camel}Spec.id;

export const ${camel}System = setup({
  types: ${camel}Spec.types,
  actions: {
    sendConnectedData: ({ system }) => {
      system.get(bus).send(emit(${camel}, {
        type: '${name.toUpperCase().replace(/-/g, '_')}_CONNECTED',
        data: {},
      }));
    },
  },
}).createMachine({
  id: ${camel},
  initial: 'idle',
  states: {
    idle: {
      on: {
        CLIENT_CONNECTED: { actions: 'sendConnectedData' },
      },
    },
  },
});

export const ${camel}Entry: SystemEntry = { spec: ${camel}Spec, machine: ${camel}System };
`;

const TYPES = (pascal: string) => `export interface ${pascal}ConnectedData {
  // Define connected data shape
}
`;

const REPOSITORY = () => `// Register EARS queries and commands here
// import { repository } from '@abuddy/sdk/ears';
`;

const PLUGIN = (camel: string, label: string, icon: string) => `import type { Plugin } from '@abuddy/sdk/fe';
import { ${icon} } from 'lucide-vue-next';
import state, { id } from './state';
import canvas from './canvas/list.vue';

const ${camel}Plugin: Plugin = {
  id,
  label: '${label}',
  icon: ${icon},
  state,
  canvas,
};

export default ${camel}Plugin;
`;

const STATE = (name: string) => `import { assign, setup, type ActorRefFrom } from 'xstate';
import breadcrumb from '@abuddy/sdk/fe';
import { safeEvents } from '@abuddy/sdk/fe';

export const id = '${name}';
export type ${toPascalCase(name)}State = ActorRefFrom<typeof ${toCamelCase(name)}State>;

const ${toCamelCase(name)}State = setup({
  types: {
    context: {} as Record<string, unknown>,
    events: {} as { type: string },
  },
}).createMachine({
  id,
  initial: 'idle',
  context: {},
  states: {
    idle: {},
  },
});

export default ${toCamelCase(name)}State;
`;

const LIST_VUE = (label: string) => `<script setup lang="ts">
</script>

<template>
  <div class="p-4">
    <h2 class="text-lg font-semibold">${label}</h2>
  </div>
</template>
`;

const SETTINGS_VUE = () => `<script setup lang="ts">
</script>

<template>
  <div class="p-4">
    <p class="text-sm text-neutral-400">No settings yet.</p>
  </div>
</template>
`;

export async function addFeature(args: string[], root: string) {
  const name = args[0];
  validateName(name, 'Feature');

  const label = parseFlag(args, '--label') || toLabel(name);
  const icon = parseFlag(args, '--icon') || 'Box';
  const designation = parseFlag(args, '--designation');
  const camel = toCamelCase(name);
  const pascal = toPascalCase(name);
  const featureDir = path.join(root, 'src', 'features', name);

  const created: string[] = [];
  const files: [string, string][] = [
    [path.join(featureDir, 'feature.config.ts'), FEATURE_CONFIG(name, designation)],
    [path.join(featureDir, 'settings.ts'), SETTINGS(name)],
    [path.join(featureDir, 'be', 'system.ts'), SYSTEM(name, camel, pascal)],
    [path.join(featureDir, 'be', 'types.ts'), TYPES(pascal)],
    [path.join(featureDir, 'be', 'repository', 'index.ts'), REPOSITORY()],
    [path.join(featureDir, 'fe', 'plugin.ts'), PLUGIN(camel, label, icon)],
    [path.join(featureDir, 'fe', 'state.ts'), STATE(name)],
    [path.join(featureDir, 'fe', 'canvas', 'list.vue'), LIST_VUE(label)],
    [path.join(featureDir, 'fe', 'settings.vue'), SETTINGS_VUE()],
  ];

  for (const [filePath, content] of files) {
    if (writeIfNotExists(filePath, content)) created.push(filePath);
  }

  const manifest = readManifest(root);
  addFeatureToManifest(manifest, {
    id: name,
    settings: `src/features/${name}/settings.ts`,
    system: { entry: `src/features/${name}/be/system.ts`, exportName: `${camel}Entry` },
    plugin: { entry: `src/features/${name}/fe/plugin.ts`, label, icon },
    services: {},
  });
  writeManifest(root, manifest);

  await generateEntries([], root);

  console.log(`\nCreated feature "${name}":`);
  logCreated(root, created);
  console.log(`\n  manifest updated + __generated__/ regenerated`);
}
