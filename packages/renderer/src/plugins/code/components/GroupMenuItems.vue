<script setup lang="ts">
import { ChevronRight, Edit2, Palette, FolderOpen, XCircle, Trash2, Pin } from 'lucide-vue-next'
import type { TabGroupColor } from '../state'

defineProps<{
  isPinned?: boolean
  ItemComponent: any
  SeparatorComponent: any
  SubComponent: any
  SubTriggerComponent: any
  SubContentComponent: any
  PortalComponent: any
}>()

const emit = defineEmits<{
  rename: []
  'change-color': [color: TabGroupColor]
  'ungroup-all': []
  'close-all': []
  delete: []
  'pin-group': []
  'unpin-group': []
}>()

const colors: TabGroupColor[] = ['blue', 'orange', 'purple', 'green', 'red', 'teal', 'yellow', 'pink', 'gray']
const ITEM_CLASS = "flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
</script>

<template>
  <component :is="ItemComponent" v-if="isPinned" @select="$emit('unpin-group')" :class="ITEM_CLASS">
    <Pin class="w-4 h-4" />
    Unpin Group
  </component>

  <component :is="ItemComponent" v-else @select="$emit('pin-group')" :class="ITEM_CLASS">
    <Pin class="w-4 h-4" />
    Pin Group
  </component>

  <component :is="SeparatorComponent" class="h-px my-1 bg-neutral-700" />

  <component :is="ItemComponent" @select="$emit('rename')" :class="ITEM_CLASS">
    <Edit2 class="w-4 h-4" />
    Rename Group
  </component>

  <component :is="SubComponent">
    <component :is="SubTriggerComponent" :class="ITEM_CLASS">
      <Palette class="w-4 h-4" />
      Change Color
      <ChevronRight class="w-3 h-3 ml-auto" />
    </component>
    <component :is="PortalComponent">
      <component :is="SubContentComponent" class="min-w-[140px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50">
        <component
          :is="ItemComponent"
          v-for="colorOption in colors"
          :key="colorOption"
          @select="$emit('change-color', colorOption)"
          :class="ITEM_CLASS"
        >
          <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: `var(--color-${colorOption})` }" />
          <span class="capitalize">{{ colorOption }}</span>
        </component>
      </component>
    </component>
  </component>

  <component :is="SeparatorComponent" class="h-px my-1 bg-neutral-700" />

  <component :is="ItemComponent" @select="$emit('ungroup-all')" :class="ITEM_CLASS">
    <FolderOpen class="w-4 h-4" />
    Ungroup All Tabs
  </component>

  <component :is="ItemComponent" @select="$emit('close-all')" :class="ITEM_CLASS">
    <XCircle class="w-4 h-4" />
    Close All Tabs
  </component>

  <component :is="SeparatorComponent" class="h-px my-1 bg-neutral-700" />

  <component :is="ItemComponent" @select="$emit('delete')" class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-red-400 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none">
    <Trash2 class="w-4 h-4" />
    Delete Group
  </component>
</template>
