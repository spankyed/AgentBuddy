<template>
  <TrackedContextMenuRoot v-if="terminalPath">
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>

    <ContextMenuPortal>
      <ContextMenuContent :class="MENU_CONTENT_CLASS">
        <ContextMenuItem
          @select="$emit('open-terminal', terminalPath)"
          :class="MENU_ITEM_CLASS"
        >
          <Terminal class="w-4 h-4" />
          Open Terminal Here
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </TrackedContextMenuRoot>

  <slot v-else />
</template>

<script setup lang="ts">
import { Terminal } from 'lucide-vue-next'
import {
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
} from 'reka-ui'
import { MENU_ITEM_CLASS, MENU_CONTENT_CLASS } from '../constants'
import TrackedContextMenuRoot from '@/core/components/design/TrackedContextMenuRoot.vue'

defineProps<{
  terminalPath?: string
}>()

defineEmits<{
  'open-terminal': [path: string]
}>()
</script>
