<template>
  <DropdownMenuRoot
    :open="open"
    @update:open="$emit('update:open', $event)"
  >
    <DropdownMenuTrigger as-child>
      <slot name="trigger" />
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        :side="side"
        :align="align"
        :side-offset="sideOffset"
        class="z-50 overflow-hidden border rounded-lg shadow-2xl w-48 bg-neutral-900 border-neutral-700"
      >
        <div class="p-1.5 max-h-80 overflow-y-auto">
          <DropdownMenuItem
            v-for="item in items"
            :key="item.type"
            @select="$emit('select', item.type)"
            class="flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-300 rounded-md cursor-pointer transition-colors hover:bg-neutral-800 hover:text-white outline-none focus:bg-neutral-800 focus:text-white"
          >
            <component :is="item.icon" class="flex-shrink-0 w-4 h-4" />
            <span class="font-medium">{{ item.label }}</span>
          </DropdownMenuItem>

          <template v-if="extraItems && extraItems.length > 0">
            <DropdownMenuSeparator v-if="extraItems[0]?.separator" class="h-px my-1 bg-neutral-700" />
            <DropdownMenuItem
              v-for="item in extraItems"
              :key="item.type"
              @select="$emit('select', item.type)"
              class="flex items-center gap-2.5 px-3 py-2 text-sm text-neutral-300 rounded-md cursor-pointer transition-colors hover:bg-neutral-800 hover:text-white outline-none focus:bg-neutral-800 focus:text-white"
            >
              <component :is="item.icon" class="flex-shrink-0 w-4 h-4" />
              <span class="font-medium">{{ item.label }}</span>
            </DropdownMenuItem>
          </template>
        </div>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { getConnectableNodeTypes } from '../nodes'
import type { Component } from 'vue'

export interface ExtraMenuItem {
  type: string
  label: string
  icon: Component
  separator?: boolean
}

interface Props {
  open: boolean
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  extraItems?: ExtraMenuItem[]
}

withDefaults(defineProps<Props>(), {
  side: 'bottom',
  align: 'start',
  sideOffset: 8,
  extraItems: () => [],
})

defineEmits<{
  'update:open': [value: boolean]
  'select': [nodeType: string]
}>()

const items = getConnectableNodeTypes()
</script>
