import * as path from 'node:path';
import { validateName, toPascalCase, writeIfNotExists, logCreated, parseFlag } from './templates';

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
  const type = args[0];
  validateName(type, 'Artifact');

  const icon = parseFlag(args, '--icon') || 'FileText';
  const pascal = toPascalCase(type);
  const filePath = path.join(root, 'src', 'extensions', 'artifacts', 'viewers', `${type}-artifact.vue`);

  const created: string[] = [];
  if (writeIfNotExists(filePath, VIEWER_VUE(pascal, icon))) {
    created.push(filePath);
  }

  console.log(`\nCreated artifact viewer "${type}":`);
  logCreated(root, created);
}
