import * as path from 'node:path';
import { generateEntries } from '../generate-entries';
import { validateName, toPascalCase, toCamelCase, toLabel, writeIfNotExists, logCreated, hasFlag, updateRegisterArray } from './templates';
import { readManifest, writeManifest, addStepDefinition } from './manifest';

const HELP = `
Usage: abuddy add step <type> [options]

Options:
  --trigger    Create a trigger-type step instead of a regular step

Example:
  abuddy add step my-step
  abuddy add step my-trigger --trigger
`.trim();

const INDEX = (type: string, camel: string, pascal: string) => `import type { StepDefinition } from '@abuddy/sdk/steps';
import type { ${pascal}DSLNode, ${pascal}CompiledNode } from './types';
import { ${camel}StepFE } from './fe';

export const ${camel}Step: StepDefinition = {
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
  fe: ${camel}StepFE.fe,
};
`;

const FE = (type: string, camel: string) => `import type { StepDefinition } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Box } from 'lucide-vue-next';

export const ${camel}StepFE: StepDefinition = {
  type: '${type}',
  fe: {
    loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
    nodeConfig: {
      label: '${toLabel(type)}',
      icon: Box,
      color: 'text-indigo-400',
      bgColor: 'bg-indigo-700/20',
      hoverBgColor: 'group-hover:bg-indigo-700/30',
      connectionRules: { inputs: -1, outputs: -1 },
      category: 'logic',
      isImplemented: true,
    },
  },
};
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
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    return;
  }

  const type = args[0];
  validateName(type, 'Step');

  const isTrigger = hasFlag(args, '--trigger');
  const camel = toCamelCase(type);
  const pascal = toPascalCase(type);
  const stepDir = path.join(root, 'src', 'extensions', 'steps', type);

  const created: string[] = [];
  const files: [string, string][] = [
    [path.join(stepDir, 'index.ts'), INDEX(type, camel, pascal)],
    [path.join(stepDir, 'fe.ts'), FE(type, camel)],
    [path.join(stepDir, 'types.ts'), TYPES(pascal, type)],
    [path.join(stepDir, 'form.vue'), FORM_VUE(pascal)],
  ];

  for (const [filePath, content] of files) {
    if (writeIfNotExists(filePath, content)) created.push(filePath);
  }

  const manifest = readManifest(root);
  const stepsConfig = manifest.steps;
  const registerPath = stepsConfig?.register;

  if (registerPath) {
    const exportName = `${camel}Step`;

    updateRegisterArray(
      path.join(root, registerPath),
      `import { ${exportName} } from './${type}';`,
      `  ${exportName},\n`,
    );

    const feRegisterPath = registerPath.replace(/\.ts$/, '-fe.ts');
    const feExportName = `${camel}StepFE`;
    updateRegisterArray(
      path.join(root, feRegisterPath),
      `import { ${feExportName} } from './${type}/fe';`,
      `  ${feExportName},\n`,
    );
  }

  addStepDefinition(manifest, {
    type,
    path: `src/extensions/steps/${type}`,
    kind: isTrigger ? 'trigger' : 'step',
  });
  writeManifest(root, manifest);

  await generateEntries([], root);

  console.log(`\nCreated step "${type}":`);
  logCreated(root, created);
  console.log(`\n  manifest + register files updated, __generated__/ regenerated`);
}
