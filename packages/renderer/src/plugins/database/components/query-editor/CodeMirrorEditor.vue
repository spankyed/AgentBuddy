<template>
  <SimpleMonacoEditor
    :model-value="modelValue"
    language="typescript"
    :actions="['executeCode']"
    :function-body="true"
    dsl-type="database"
    @update:model-value="$emit('update:modelValue', $event)"
    @execute="$emit('execute')"
    @cursor-change="$emit('cursorChange', $event)"
    class="h-full"
  />
</template>

<script setup lang="ts">
import SimpleMonacoEditor from '@/core/components/SimpleMonacoEditor.vue';

defineProps<{
  modelValue: string;
}>();

defineEmits<{
  'update:modelValue': [value: string];
  execute: [];
  cursorChange: [position: { line: number; col: number }];
}>();
</script> 