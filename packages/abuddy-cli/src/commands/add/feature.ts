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

/** The system's contract: what it receives, what its own children send it, and what it sends its plugin. */
const BE_CONTRACT = (name: string, pascal: string) => `import type { Incoming${pascal}Events, Outgoing${pascal}Events } from './types';

// This system's contract, which abuddy.json names at features[].system.contract. Codegen reads it as a declared
// type, without running anything, so it lives here rather than on the spec: a type has no declared-versus-inferred
// gap, and nothing an annotation can widen away.
//
// Add \`internal\` for what this system's own children send it (a \`fromCallback\` child telling its parent). Those
// reach the machine's event union and nothing a pack depending on yours can see.
export type Contract = {
  incoming: Incoming${pascal}Events;
  outgoing: Outgoing${pascal}Events;
};
`;

const SYSTEM = (name: string, camel: string, pascal: string) => `import { setup } from 'xstate';
import { defineSystem } from '@abuddy/sdk/framework';
// broadcastToPlugin is typed with the events each of this pack's plugins receives
import { broadcastToPlugin } from '#generated/events';
import type { Contract } from './contract';

export const ${camel}Spec = defineSystem<Contract>();

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
        // Every system gets CLIENT_CONNECTED, and answers it with the data its plugin starts from
        CLIENT_CONNECTED: { actions: 'sendConnectedData' },
        // A contract's \`incoming\` says what may be sent; the bus routes an event to a system only if its
        // machine names it, so an event declared and never handled here is dropped
        REFRESH_${name.toUpperCase().replace(/-/g, '_')}: { actions: 'sendConnectedData' },
      },
    },
  },
});

// The manifest loads this default export. Nothing to annotate: the events come from the contract above, and the
// generated pack entry checks that this spec was built from the one abuddy.json names.
export default { spec: ${camel}Spec, machine: ${camel}System };
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

const TYPES = (pascal: string, name: string) => `export interface ${pascal}ConnectedData {
  // Define connected data shape
}

// What anything outside this system may send it. CLIENT_CONNECTED, PACK_CHANGED and FEATURE_SETTINGS_UPDATED are
// the app's, which every system receives, so no contract declares them.
export type Incoming${pascal}Events =
  | { type: 'REFRESH_${name.toUpperCase().replace(/-/g, '_')}' };

export type Outgoing${pascal}Events =
  | { type: '${name.toUpperCase().replace(/-/g, '_')}_CONNECTED'; data: Record<string, unknown> };
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

// What this plugin publishes is its contract, in fe/contract.ts beside it

// Registered at the feature's address by the host, so the module carries no id
const ${camel}Plugin = definePlugin({
  label: '${label}',
  icon: ${icon},
  state,
  canvas,
});

export default ${camel}Plugin;
`;

const FE_CONTRACT = (pascal: string) => `import type { PluginInbox } from '@abuddy/sdk/fe';

// This plugin's contract: the state it publishes, and what another plugin may send it. A leaf — it imports no
// machine, no other feature and nothing from #generated/* but \`types\` and \`ears\`, which is what lets codegen read
// the contract without resolving the machine, whose own imports cycle back through #generated/events.
// abuddy.json names it at features[].plugin.contract.

export interface ${pascal}Context {
  ready: boolean;
}

/**
 * What another feature may send this plugin, by audience: \`pack\` is your own pack's features, \`public\` is what a
 * pack depending on yours may send. Its own feature's system needs no declaration — codegen reads that system's
 * outgoing events. Delete \`inbox\` for a plugin nothing else sends to.
 */
export type ${pascal}Inbox = { type: 'SOMETHING'; id: string };

export type Contract = {
  state: ${pascal}Context;
  inbox: PluginInbox<{ pack: ${pascal}Inbox }>;
};
`;

const STATE = (name: string) => `import { setup, type ActorRefFrom } from 'xstate';
import type { ${toPascalCase(name)}Context, ${toPascalCase(name)}Inbox } from './contract';

// The feature's name, which this pack's code sends to and opens the plugin by (\`openPlugin\` from #generated/fe)
export const id = '${name}';
export type ${toPascalCase(name)}State = ActorRefFrom<typeof ${toCamelCase(name)}State>;

const ${toCamelCase(name)}State = setup({
  types: {
    context: {} as ${toPascalCase(name)}Context,
    events: {} as ${toPascalCase(name)}Inbox | { type: string },
  },
}).createMachine({
  id,
  initial: 'idle',
  context: { ready: false },
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
    [path.join(featureDir, 'be', 'types.ts'), TYPES(pascal, name)],
    [path.join(featureDir, 'be', 'contract.ts'), BE_CONTRACT(name, pascal)],
    [path.join(featureDir, 'be', 'repository', 'index.ts'), REPOSITORY(camel)],
    [path.join(featureDir, 'fe', 'plugin.ts'), PLUGIN(camel, label, icon)],
    [path.join(featureDir, 'fe', 'contract.ts'), FE_CONTRACT(pascal)],
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
    system: { entry: `src/features/${name}/be/system.ts`, contract: `src/features/${name}/be/contract.ts#Contract` },
    plugin: { entry: `src/features/${name}/fe/plugin.ts`, contract: `src/features/${name}/fe/contract.ts#Contract` },
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
