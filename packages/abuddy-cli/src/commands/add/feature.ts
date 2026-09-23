import { FEATURE_ID_PATTERN } from '@abuddy/sdk/build';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { regenerateAfterScaffold } from '../generate-entries';
import { scaffoldUnitTestSetup, type UnitTestSetup } from '../init';
import { toPascalCase, toCamelCase, toLabel, writeIfNotExists, logCreated, parseFlag, hasFlag } from './templates';
import { readManifest, writeManifest, addFeature as addFeatureToManifest } from './manifest';

const SETTINGS = (id: string) => `export default {
  visible: true,
  plugins: {
    ${id}: {}
  }
}
`;

const SYSTEM = (name: string, camel: string, pascal: string) => `import { setup } from 'xstate';
import { defineSystem, type SystemEntry } from '@abuddy/sdk/framework';
// broadcastToPlugin is typed with the events each of this pack's plugins receives
import { broadcastToPlugin } from '#generated/events';

type Incoming${pascal}Events =
  | { type: 'CLIENT_CONNECTED' };

export type Outgoing${pascal}Events =
  | { type: '${name.toUpperCase().replace(/-/g, '_')}_CONNECTED'; data: Record<string, unknown> };

export const ${camel}Spec = defineSystem<Incoming${pascal}Events, Outgoing${pascal}Events>();

export const ${camel}System = setup({
  types: ${camel}Spec.types,
  actions: {
    sendConnectedData: () => {
      broadcastToPlugin('${name}', {
        type: '${name.toUpperCase().replace(/-/g, '_')}_CONNECTED',
        data: {},
      });
    },
  },
}).createMachine({
  id: '${name}',
  initial: 'idle',
  states: {
    idle: {
      on: {
        CLIENT_CONNECTED: { actions: 'sendConnectedData' },
      },
    },
  },
});

const ${camel}Entry = { spec: ${camel}Spec, machine: ${camel}System } satisfies SystemEntry;

export default ${camel}Entry;
`;

const SYSTEM_SPEC = (name: string) => {
  const connected = `${name.toUpperCase().replace(/-/g, '_')}_CONNECTED`;
  return `// The ${name} system under the app's bus, without the app (@abuddy/testing/harness)
import { describe, expect, it } from 'vitest';
import { startApp } from '@abuddy/testing/harness';

describe('${name} system', () => {
  it('sends its connected data when a client connects', async () => {
    const app = await startApp({ systems: ['${name}'] });
    await app.connect();
    expect(await app.nextEmit('${name}', '${connected}')).toMatchObject({ data: {} });
  });
});
`;
};

const TYPES = (pascal: string) => `export interface ${pascal}ConnectedData {
  // Define connected data shape
}
`;

const REPOSITORY = (camel: string) => `// EARS reads and writes for this feature. Declared in abuddy.json (features[].repositories) and
// registered by the generated pack entry; systems and actions use them through
// \`repository\` from '#generated/repository'. Typed query helpers come from '#generated/ears'.
export const ${camel}Queries = {};

export const ${camel}Commands = {};
`;

const PLUGIN = (camel: string, label: string, icon: string) => `import { definePlugin } from '@abuddy/sdk/fe';
import { ${icon} } from 'lucide-vue-next';
import state from './state';
import canvas from './canvas/list.vue';

// What this plugin publishes — its state, and what another feature may send it — is its contract, a declared type
// in a leaf module beside it that abuddy.json names at features[].plugin.contract:
//   export type Contract = { state: MyContext; inbox: PluginInbox<{ pack: { type: 'SOMETHING'; id: string } }> };
// Its own feature's system needs no declaration — codegen reads that system's outgoing events.

// Registered at the feature's address by the host, so the module carries no id
const ${camel}Plugin = definePlugin({
  label: '${label}',
  icon: ${icon},
  state,
  canvas,
});

export default ${camel}Plugin;
`;

const STATE = (name: string) => `import { setup, type ActorRefFrom } from 'xstate';

// The feature's name, which this pack's code sends to and opens the plugin by (\`navigateToPlugin\` from #generated/fe)
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

const HELP = `
Usage: abuddy add feature <name> [options]

Options:
  --label <Label>          Display label (default: derived from name)
  --icon <LucideIcon>      Lucide icon name (default: Box)
  --designation <role>     The role this feature plays, for getDesignated(role); need not be the feature name

Example:
  abuddy add feature bookmarks --label "Bookmarks" --icon Bookmark
`.trim();

export async function addFeature(args: string[], root: string) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    return;
  }

  const name = args[0];
  if (!name) throw new Error('Feature name is required');
  if (!FEATURE_ID_PATTERN.test(name)) {
    throw new Error(`Feature name "${name}" must start with a lowercase letter and contain only letters and digits (e.g. "notes" or "calendarEvents"); it is used as an identifier in generated code`);
  }

  const label = parseFlag(args, '--label') || toLabel(name);
  const icon = parseFlag(args, '--icon') || 'Box';
  const designation = parseFlag(args, '--designation');
  const camel = toCamelCase(name);
  const pascal = toPascalCase(name);
  const featureDir = path.join(root, 'src', 'features', name);

  const created: string[] = [];
  // The system test runs on the harness: a pack scaffolded before it has no tests/setup.ts
  const unitTestSetup = fs.existsSync(path.join(root, 'tests', 'setup.ts')) ? undefined : scaffoldUnitTestSetup(root);
  const files: [string, string][] = [
    [path.join(featureDir, 'settings.ts'), SETTINGS(name)],
    [path.join(featureDir, 'be', 'system.ts'), SYSTEM(name, camel, pascal)],
    [path.join(featureDir, 'be', 'types.ts'), TYPES(pascal)],
    [path.join(featureDir, 'be', 'repository', 'index.ts'), REPOSITORY(camel)],
    [path.join(featureDir, 'fe', 'plugin.ts'), PLUGIN(camel, label, icon)],
    [path.join(featureDir, 'fe', 'state.ts'), STATE(name)],
    [path.join(featureDir, 'fe', 'canvas', 'list.vue'), LIST_VUE(label)],
    [path.join(featureDir, 'fe', 'settings.vue'), SETTINGS_VUE()],
    [path.join(root, 'tests', 'unit', `${name}-system.spec.ts`), SYSTEM_SPEC(name)],
  ];

  for (const [filePath, content] of files) {
    if (writeIfNotExists(filePath, content)) created.push(filePath);
  }

  const manifest = readManifest(root);
  addFeatureToManifest(manifest, {
    id: name,
    ...(designation !== undefined && { designation }),
    settings: `src/features/${name}/settings.ts`,
    system: { entry: `src/features/${name}/be/system.ts` },
    plugin: { entry: `src/features/${name}/fe/plugin.ts` },
    services: {},
    repositories: {
      [`${camel}Queries`]: `src/features/${name}/be/repository/index.ts#${camel}Queries`,
      [`${camel}Commands`]: `src/features/${name}/be/repository/index.ts#${camel}Commands`,
    },
  });
  writeManifest(root, manifest);

  const regenerated = await regenerateAfterScaffold(root);

  console.log(`\nCreated feature "${name}":`);
  logCreated(root, [...(unitTestSetup?.created ?? []), ...created]);
  if (regenerated) console.log(`\n  manifest updated + __generated__/ regenerated`);
  if (unitTestSetup) logUnitTestSetup(unitTestSetup);
}

function logUnitTestSetup({ keptConfig, addedDependencies, upgrades }: UnitTestSetup): void {
  console.log(`\nThe pack had no unit test setup, which the feature's system test runs on: added tests/setup.ts (@abuddy/testing/harness).`);
  if (keptConfig) {
    console.log(`  ${keptConfig} already exists: give its test options isolatedDataDir()'s env and globalSetup, and setupFiles: [...dataDir.setupFiles, './tests/setup.ts'] (@abuddy/testing/vitest)`);
  }
  if (addedDependencies.length > 0) {
    console.log(`  Added ${addedDependencies.join(', ')} to devDependencies. Run: npm install`);
  }
  if (upgrades.length > 0) {
    console.log(`  The harness can't run on the pack's ${upgrades.map(({ name, reason }) => `${name} (${reason})`).join(', ')}.`);
    console.log(`  Upgrade: npm install -D ${upgrades.map(({ name, range }) => `${name}@"${range}"`).join(' ')}`);
  }
}
