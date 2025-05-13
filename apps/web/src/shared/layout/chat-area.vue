<template>
  <div
    class="pt-2 flex flex-col bg-neutral-900"
    :class="$style.component"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
</script>

<style lang="scss" module>
.component {
  min-height: 55vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 -0.5rem 1rem -0.125rem rgba(0, 0, 0, 0.1), 0 -0.25rem 0.5rem -0.0625rem rgba(0, 0, 0, 0.05);
}
</style> 