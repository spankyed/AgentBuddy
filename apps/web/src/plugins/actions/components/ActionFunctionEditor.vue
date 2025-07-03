<template>
  <div class="relative h-full">
    <textarea
      :value="value"
      @input="$emit('update', ($event.target as HTMLTextAreaElement).value)"
      class="w-full h-full p-4 font-mono text-sm leading-relaxed resize-none bg-neutral-900 text-neutral-100 focus:outline-none"
      :placeholder="placeholder"
      spellcheck="false"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  value: string;
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

<style scoped>
/* Custom scrollbar for the editor */
textarea {
  scrollbar-width: thin;
  scrollbar-color: #525252 #171717;
}

textarea::-webkit-scrollbar {
  width: 8px;
}

textarea::-webkit-scrollbar-track {
  background: #171717;
}

textarea::-webkit-scrollbar-thumb {
  background-color: #525252;
  border-radius: 4px;
}

textarea::-webkit-scrollbar-thumb:hover {
  background-color: #737373;
}
</style>