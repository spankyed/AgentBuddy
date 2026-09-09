import * as path from 'node:path';
import { validateName, toPascalCase, writeIfNotExists, logCreated, parseFlag, hasFlag, updateRegisterArray, updateComponentMap } from './templates';
import { readManifest } from './manifest';

const HELP = `
Usage: abuddy add artifact <type> [options]

Options:
  --icon <Icon>    Lucide icon name (default: FileText)

Example:
  abuddy add artifact chart --icon BarChart3
`.trim();

const VIEWER_VUE = (pascal: string, icon: string) => `<script setup lang="ts">
import { ${icon} } from 'lucide-vue-next';

defineProps<{ data: Record<string, unknown> }>();
</script>

<template>
  <div class="p-4">
    <div class="flex items-center gap-2 mb-2">
      <${icon} class="w-4 h-4" />
      <span class="text-sm font-medium">${pascal} Artifact</span>
    </div>
    <pre class="text-xs text-neutral-400">{{ data }}</pre>
  </div>
</template>
`;

export async function addArtifact(args: string[], root: string) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    return;
  }

  const type = args[0];
  validateName(type, 'Artifact');

  const icon = parseFlag(args, '--icon') || 'FileText';
  const pascal = toPascalCase(type);
  const viewerPath = path.join(root, 'src', 'extensions', 'artifacts', 'viewers', `${type}-artifact.vue`);

  const created: string[] = [];
  if (writeIfNotExists(viewerPath, VIEWER_VUE(pascal, icon))) {
    created.push(viewerPath);
  }

  const manifest = readManifest(root);
  const registerPath = manifest.artifacts;

  if (registerPath) {
    updateRegisterArray(
      path.join(root, registerPath),
      `import { ${icon} } from 'lucide-vue-next';`,
      `  {\n    type: '${type}',\n    fe: {\n      icon: ${icon},\n      loadComponent: () => require('./viewers/${type}-artifact.vue').default,\n    },\n  },\n`,
    );

    const feRegisterPath = registerPath.replace(/\.ts$/, '-fe.ts');
    const importName = `${pascal}Artifact`;
    updateComponentMap(
      path.join(root, feRegisterPath),
      `import ${importName} from './viewers/${type}-artifact.vue';`,
      type,
      importName,
    );
  }

  console.log(`\nCreated artifact viewer "${type}":`);
  logCreated(root, created);
  if (registerPath) console.log(`\n  register files updated`);
}
