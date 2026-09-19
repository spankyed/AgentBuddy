<template>
  <SimpleMonacoEditor
    :model-value="value"
    language="typescript"
    :function-body="true"
    dsl-type="action"
    :dsl-params="inputParams"
    :placeholder="placeholder"
    @update:model-value="$emit('update', $event)"
    class="h-full"
  />
</template>

<script setup lang="ts">
import SimpleMonacoEditor from '@abuddy/ui/components/SimpleMonacoEditor';
import type { ActionParameter } from '@abuddy/sdk';

defineProps<{
  value: string;
  inputParams?: Record<string, ActionParameter>;
}>();

defineEmits<{
  update: [value: string];
}>();

const placeholder = `// Example action function
const { threadId, question } = params;

// Use available services
await services.logger.info('Starting action', { threadId });

try {
  // Ask a model, with the user's key for its provider
  const { text } = await services.inference.generateText({
    model: 'anthropic:claude-opus-5',
    prompt: question,
  });

  // Post the answer to the thread
  services.chat.sendSystemMessage({ threadId, text });

  return { success: true, data: text };
} catch (error) {
  await services.logger.error('Action failed', error);
  throw error;
}`;
</script>