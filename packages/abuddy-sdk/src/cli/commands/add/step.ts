import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateEntries } from '../generate-entries';
import { validateName, toPascalCase, toCamelCase, toLabel, writeIfNotExists, logCreated, hasFlag } from './templates';
import { readManifest, writeManifest, addStepDefinition } from './manifest';

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

function updateRegisterFile(
  filePath: string,
  importLine: string,
  exportName: string,
): boolean {
  if (!fs.existsSync(filePath)) return false;
  let content = fs.readFileSync(filePath, 'utf-8');

  if (content.includes(exportName)) return false;

  const lastImportIdx = content.lastIndexOf('\nimport ');
  if (lastImportIdx === -1) return false;
  const endOfLastImport = content.indexOf('\n', lastImportIdx + 1);
  content = content.slice(0, endOfLastImport + 1) + importLine + '\n' + content.slice(endOfLastImport + 1);

  const arrayCloseIdx = content.lastIndexOf('];');
  if (arrayCloseIdx === -1) return false;
  content = content.slice(0, arrayCloseIdx) + `  ${exportName},\n` + content.slice(arrayCloseIdx);

  fs.writeFileSync(filePath, content);
  return true;
}

export async function addStep(args: string[], root: string) {
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
  const registerPath = typeof stepsConfig === 'string'
    ? stepsConfig
    : stepsConfig?.register;

  if (registerPath) {
    const beRegister = path.join(root, registerPath);
    const suffix = isTrigger ? 'Trigger' : 'Step';
    const exportName = `${camel}${suffix}`;
    updateRegisterFile(
      beRegister,
      `import { ${exportName} } from './${type}';`,
      exportName,
    );

    const feRegisterPath = registerPath.replace(/\.ts$/, '-fe.ts');
    const feRegister = path.join(root, feRegisterPath);
    const feExportName = `${camel}${suffix}FE`;
    updateRegisterFile(
      feRegister,
      `import { ${feExportName} } from './${type}/fe';`,
      feExportName,
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
  console.log(`\n  manifest updated + register files updated + __generated__/ regenerated`);
}
