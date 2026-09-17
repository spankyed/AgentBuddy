import * as path from 'node:path';
import { validateName, toPascalCase, writeIfNotExists, logCreated, hasFlag, updateRegisterArray, updateComponentMap } from './templates';
import { readManifest } from './manifest';

const HELP = `
Usage: abuddy add block <type> [options]

Options:
  --input    Create an input block instead of a display block

Example:
  abuddy add block rating
  abuddy add block color-picker --input
`.trim();

// The threads chat renders a message's blocks with each block's `props` spread as component props;
// input blocks also get `disabled` (the message has been answered) and `response`, and answer
// by emitting `submit` (the response) or `cancel`
const DISPLAY_BLOCK_VUE = (pascal: string) => `<script setup lang="ts">
defineProps<{ text?: string }>();
</script>

<template>
  <div class="p-2">
    <p class="text-sm">{{ text ?? '${pascal} Block' }}</p>
  </div>
</template>
`;

const INPUT_BLOCK_VUE = (pascal: string) => `<script setup lang="ts">
defineProps<{
  label?: string;
  disabled?: boolean;
  response?: unknown;
}>();

defineEmits<{
  submit: [response: unknown];
  cancel: [];
}>();
</script>

<template>
  <div class="p-2 space-y-2">
    <p class="text-sm">{{ label ?? '${pascal} Input' }}</p>
    <p v-if="disabled && response" class="text-xs text-neutral-400">{{ response }}</p>
    <div v-else class="flex gap-2">
      <button class="text-sm" :disabled="disabled" @click="$emit('submit', true)">Submit</button>
      <button class="text-sm" :disabled="disabled" @click="$emit('cancel')">Cancel</button>
    </div>
  </div>
</template>
`;

export async function addBlock(args: string[], root: string) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    return;
  }

  const type = args[0];
  validateName(type, 'Block');

  const isInput = hasFlag(args, '--input');
  const pascal = toPascalCase(type);

  const created: string[] = [];
  let componentFileName: string;
  let importName: string;

  if (isInput) {
    componentFileName = `input/${pascal}Input.vue`;
    importName = `${pascal}Input`;
    const filePath = path.join(root, 'src', 'extensions', 'blocks', componentFileName);
    if (writeIfNotExists(filePath, INPUT_BLOCK_VUE(pascal))) created.push(filePath);
  } else {
    componentFileName = `display/${pascal}Block.vue`;
    importName = `${pascal}Block`;
    const filePath = path.join(root, 'src', 'extensions', 'blocks', componentFileName);
    if (writeIfNotExists(filePath, DISPLAY_BLOCK_VUE(pascal))) created.push(filePath);
  }

  const manifest = readManifest(root);
  const registerPath = manifest.blocks;

  if (registerPath) {
    const kindStr = isInput ? `, kind: 'input'` : '';
    updateRegisterArray(
      path.join(root, registerPath),
      '',
      `  { type: '${type}'${kindStr} },\n`,
    );

    const feRegisterPath = registerPath.replace(/\.ts$/, '-fe.ts');
    updateComponentMap(
      path.join(root, feRegisterPath),
      `import ${importName} from './${componentFileName}';`,
      type,
      importName,
    );
  }

  console.log(`\nCreated block "${type}":`);
  logCreated(root, created);
  if (registerPath) console.log(`\n  register files updated`);
}
