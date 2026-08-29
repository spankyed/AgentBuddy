<template>
  <SimpleMonacoEditor
    :model-value="value"
    language="typescript"
    :function-body="true"
    dsl-type="prompt"
    :dsl-params="inputParams"
    @update:model-value="$emit('update', $event)"
    class="h-full"
  />
</template>

<script setup lang="ts">
import SimpleMonacoEditor from '@/core/components/SimpleMonacoEditor.vue';
import type { TemplateInput } from '@app/api';

defineProps<{
  value: string;
  inputParams?: Record<string, TemplateInput>;
}>();

defineEmits<{
  update: [value: string];
}>();
</script> 