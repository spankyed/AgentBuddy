<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { ChevronRight, Palette, FolderOpen, Trash2, Pin } from 'lucide-vue-next'
import type { TabGroupColor } from './types'

const props = defineProps<{
  name: string
  isPinned?: boolean
  ItemComponent: any
  SeparatorComponent: any
  SubComponent: any
  SubTriggerComponent: any
  SubContentComponent: any
  PortalComponent: any
}>()

const emit = defineEmits<{
  rename: [name: string]
  'change-color': [color: TabGroupColor]
  'ungroup-all': []
  'close-all': []
  'pin-group': []
  'unpin-group': []
  'request-close': []
}>()

const editingName = ref(props.name)
const nameInput = ref<HTMLInputElement | null>(null)

onMounted(() => {
  nextTick(() => {
    nameInput.value?.focus()
    nameInput.value?.select()
  })
})

watch(() => props.name, (newName) => {
  editingName.value = newName
})

const handleRename = () => {
  if (editingName.value.trim() !== props.name) {
    emit('rename', editingName.value.trim())
  }
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    (event.target as HTMLInputElement).blur()
    emit('request-close')
  } else if (event.key === 'Escape') {
    editingName.value = props.name
    ;(event.target as HTMLInputElement).blur()
    emit('request-close')
  }
}

const colors: TabGroupColor[] = ['blue', 'orange', 'purple', 'green', 'red', 'teal', 'yellow', 'pink', 'gray']
const ITEM_CLASS = "flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
</script>

<template>
  <!-- Rename input at top -->
  <div class="px-3 py-2">
    <input
      ref="nameInput"
      v-model="editingName"
      @blur="handleRename"
      @keydown="handleKeydown"
      @click.stop
      class="w-full px-2 py-1 text-sm bg-neutral-800 border rounded text-neutral-200 border-neutral-600 focus:outline-none focus:border-blue-500"
      placeholder="Group name..."
    />
  </div>

  <component :is="SeparatorComponent" class="h-px my-1 bg-neutral-700" />

  <component :is="ItemComponent" v-if="isPinned" @select="$emit('unpin-group')" :class="ITEM_CLASS">
    <Pin class="w-4 h-4" />
    Unpin Group
  </component>

  <component :is="ItemComponent" v-else @select="$emit('pin-group')" :class="ITEM_CLASS">
    <Pin class="w-4 h-4" />
    Pin Group
  </component>

  <component :is="SeparatorComponent" class="h-px my-1 bg-neutral-700" />

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
    Ungroup
  </component>

  <component :is="ItemComponent" @select="$emit('close-all')" class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-red-400 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none">
    <Trash2 class="w-4 h-4" />
    Close Group
  </component>
</template>
