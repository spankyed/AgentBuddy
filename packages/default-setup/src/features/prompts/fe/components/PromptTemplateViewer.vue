<template>
  <SimpleMonacoEditor
    :model-value="value"
    language="javascript"
    :read-only="true"
    class="h-full"
  />
</template>

<script setup lang="ts">
import SimpleMonacoEditor from '@apack/ui/components/SimpleMonacoEditor';

defineProps<{
  value: string;
}>();
</script> 