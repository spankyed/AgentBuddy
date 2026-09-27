<script setup lang="ts">
defineProps<{ text?: string }>();
</script>

<template>
  <div class="p-2">
    <p class="text-sm">{{ text ?? '__PASCAL__ Block' }}</p>
  </div>
</template>
