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
import SimpleMonacoEditor from '@abuddy/ui/components/SimpleMonacoEditor';
import type { TemplateInput } from '@/__generated__/types';

defineProps<{
  value: string;
  inputParams?: Record<string, TemplateInput>;
}>();

defineEmits<{
  update: [value: string];
}>();
</script> 