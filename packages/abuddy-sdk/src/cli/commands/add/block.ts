import * as path from 'node:path';
import { validateName, toPascalCase, writeIfNotExists, logCreated, hasFlag } from './templates';

const DISPLAY_BLOCK_VUE = (pascal: string) => `<script setup lang="ts">
defineProps<{ data: Record<string, unknown> }>();
</script>

<template>
  <div class="p-2">
    <p class="text-sm">${pascal} Block</p>
  </div>
</template>
`;

const INPUT_BLOCK_VUE = (pascal: string) => `<script setup lang="ts">
defineProps<{ modelValue: Record<string, unknown> }>();
defineEmits<{ 'update:modelValue': [value: Record<string, unknown>] }>();
</script>

<template>
  <div class="p-2">
    <p class="text-sm">${pascal} Input</p>
  </div>
</template>
`;

export async function addBlock(args: string[], root: string) {
  const type = args[0];
  validateName(type, 'Block');

  const isInput = hasFlag(args, '--input');
  const pascal = toPascalCase(type);

  const created: string[] = [];

  if (isInput) {
    const filePath = path.join(root, 'src', 'extensions', 'blocks', 'input', `${pascal}Input.vue`);
    if (writeIfNotExists(filePath, INPUT_BLOCK_VUE(pascal))) created.push(filePath);
  } else {
    const filePath = path.join(root, 'src', 'extensions', 'blocks', 'display', `${pascal}Block.vue`);
    if (writeIfNotExists(filePath, DISPLAY_BLOCK_VUE(pascal))) created.push(filePath);
  }

  console.log(`\nCreated block "${type}":`);
  logCreated(root, created);
}
