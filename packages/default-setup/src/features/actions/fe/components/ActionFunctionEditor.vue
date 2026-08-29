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
import SimpleMonacoEditor from '@/core/components/SimpleMonacoEditor.vue';
import type { ActionParameter } from '@app/api';

defineProps<{
  value: string;
  inputParams?: Record<string, ActionParameter>;
}>();

defineEmits<{
  update: [value: string];
}>();

const placeholder = `// Example action function
const { param1, param2 } = params;

// Use available services
await services.logger.info('Starting action', { param1, param2 });

try {
  // Your action logic here
  const result = await services.database.query(
    'SELECT * FROM users WHERE id = ?',
    [param1]
  );
  
  // Send email notification
  await services.email.send(
    param2,
    'Action completed',
    'Your action has been processed successfully.'
  );
  
  return {
    success: true,
    data: result.rows
  };
} catch (error) {
  await services.logger.error('Action failed', error);
  throw error;
}`;
</script>