<script setup lang="ts">
defineProps<{ note?: string }>();
</script>

<template>
  <div class="text-sm" data-testid="stamp-block">{{ note ?? 'stamped' }}</div>
</template>
