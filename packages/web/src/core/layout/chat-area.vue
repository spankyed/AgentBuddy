<template>
  <div
    class="flex flex-col pt-2 bg-neutral-900"
    :class="$style.component"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
</script>

<style lang="scss" module>
.component {
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style> 