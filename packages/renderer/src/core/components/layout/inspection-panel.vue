<template>
  <div class="relative flex flex-col h-full min-w-0 border-l bg-neutral-900 border-neutral-800">
    <div class="flex-grow overflow-y-auto overflow-x-hidden">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  label: string
}

defineProps<Props>();
defineEmits<(e: 'panel-toggle' | 'panel-back') => void>();
</script>

<style lang="scss" module>

</style> 