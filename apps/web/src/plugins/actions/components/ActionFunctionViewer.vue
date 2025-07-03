<template>
  <div class="relative h-full overflow-auto bg-neutral-900">
    <pre class="p-4 font-mono text-sm leading-relaxed text-neutral-100">{{ code }}</pre>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  code: string;
}>();
</script>

<style scoped>
/* Custom scrollbar */
div {
  scrollbar-width: thin;
  scrollbar-color: #525252 #171717;
}

div::-webkit-scrollbar {
  width: 8px;
}

div::-webkit-scrollbar-track {
  background: #171717;
}

div::-webkit-scrollbar-thumb {
  background-color: #525252;
  border-radius: 4px;
}

div::-webkit-scrollbar-thumb:hover {
  background-color: #737373;
}
</style>