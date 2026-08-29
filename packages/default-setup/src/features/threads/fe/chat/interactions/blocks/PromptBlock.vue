<template>
  <div class="text-sm font-medium text-neutral-300">
    {{ content }}
  </div>
</template>

<script setup lang="ts">
interface Props {
  content: string
}

defineProps<Props>()
</script>
