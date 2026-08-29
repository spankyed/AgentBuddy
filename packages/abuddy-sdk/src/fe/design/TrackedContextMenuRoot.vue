<template>
  <ContextMenuRoot @update:open="handleOpen">
    <slot />
  </ContextMenuRoot>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { ContextMenuRoot } from 'reka-ui'
import { onMenuOpenChange } from '@/core/composables/useMenuState'

const isOpen = ref(false)
const handleOpen = (open: boolean) => {
  isOpen.value = open
  onMenuOpenChange(open)
}
onBeforeUnmount(() => {
  if (isOpen.value) onMenuOpenChange(false)
})
</script>
