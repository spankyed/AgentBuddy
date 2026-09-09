import * as path from 'node:path';
import { generateEntries } from '../generate-entries';
import { validateName, toPascalCase, toLabel, writeIfNotExists, logCreated, hasFlag } from './templates';
import { readManifest, writeManifest, addStepDefinition } from './manifest';

const INDEX = (type: string, pascal: string) => `import type { StepDefinition } from '@abuddy/sdk/steps';
import type { ${pascal}DSLNode, ${pascal}CompiledNode } from './types';

const ${type}Step: StepDefinition = {
  type: '${type}',
  build: {
    compile(node: ${pascal}DSLNode) {
      return { type: '${type}' } as ${pascal}CompiledNode;
    },
    validate(node: ${pascal}DSLNode) {
      return [];
    },
    getLabel(node: ${pascal}DSLNode) {
      return '${toLabel(type)}';
    },
  },
  fe: (await import('./fe')).default.fe!,
};

export default ${type}Step;
`;

const FE = (type: string) => `import type { StepDefinition } from '@abuddy/sdk/steps';

const ${type}FE: StepDefinition = {
  type: '${type}',
  fe: {
    nodeConfig: {
      label: '${toLabel(type)}',
      icon: 'Box',
      color: '#6366f1',
      category: 'logic',
    },
    defaults: {},
  },
};

export default ${type}FE;
`;

const TYPES = (pascal: string, type: string) => `export interface ${pascal}DSLNode {
  type: '${type}';
}

export interface ${pascal}CompiledNode {
  type: '${type}';
}
`;

const FORM_VUE = (pascal: string) => `<script setup lang="ts">
defineProps<{ modelValue: Record<string, unknown> }>();
defineEmits<{ 'update:modelValue': [value: Record<string, unknown>] }>();
</script>

<template>
  <div class="p-2">
    <p class="text-xs text-neutral-400">${pascal} step configuration</p>
  </div>
</template>
`;

export async function addStep(args: string[], root: string) {
  const type = args[0];
  validateName(type, 'Step');

  const isTrigger = hasFlag(args, '--trigger');
  const pascal = toPascalCase(type);
  const stepDir = path.join(root, 'src', 'extensions', 'steps', type);

  const created: string[] = [];
  const files: [string, string][] = [
    [path.join(stepDir, 'index.ts'), INDEX(type, pascal)],
    [path.join(stepDir, 'fe.ts'), FE(type)],
    [path.join(stepDir, 'types.ts'), TYPES(pascal, type)],
    [path.join(stepDir, 'form.vue'), FORM_VUE(pascal)],
  ];

  for (const [filePath, content] of files) {
    if (writeIfNotExists(filePath, content)) created.push(filePath);
  }

  const manifest = readManifest(root);
  addStepDefinition(manifest, {
    type,
    path: `src/extensions/steps/${type}`,
    kind: isTrigger ? 'trigger' : 'step',
  });
  writeManifest(root, manifest);

  await generateEntries([], root);

  console.log(`\nCreated step "${type}":`);
  logCreated(root, created);
  console.log(`\n  manifest updated + __generated__/ regenerated`);
}
