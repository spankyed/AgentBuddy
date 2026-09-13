<template>
  <SimpleMonacoEditor
    :model-value="code"
    language="javascript"
    :read-only="true"
    class="h-full"
  />
</template>

<script setup lang="ts">
import SimpleMonacoEditor from '@abuddy/ui/components/SimpleMonacoEditor';

defineProps<{
  code: string;
}>();
</script>