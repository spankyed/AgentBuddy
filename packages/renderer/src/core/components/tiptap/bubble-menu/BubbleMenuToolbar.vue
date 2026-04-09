<template>
  <div class="flex items-center gap-0.5 px-1.5 py-1">
    <button
      v-for="item in items"
      :key="item.action"
      type="button"
      class="p-1.5 rounded hover:bg-neutral-600 transition-colors text-neutral-400 hover:text-neutral-200"
      :class="{ 'bg-neutral-600 text-neutral-100': item.isActive?.() }"
      :title="item.title"
      @click="item.action === 'link' ? emit('toggle-link') : item.command()"
    >
      <component :is="item.icon" :size="15" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import { Bold, Italic, Strikethrough, Code, Link } from 'lucide-vue-next'

const props = defineProps<{ editor: Editor }>()
const emit = defineEmits<{ (e: 'toggle-link'): void }>()

const items = computed(() => {
  const e = props.editor
  if (!e) return []

  const allItems = [
    {
      action: 'bold',
      title: 'Bold',
      icon: Bold,
      isActive: () => e.isActive('bold'),
      command: () => e.chain().focus().toggleBold().run(),
    },
    {
      action: 'italic',
      title: 'Italic',
      icon: Italic,
      isActive: () => e.isActive('italic'),
      command: () => e.chain().focus().toggleItalic().run(),
    },
    {
      action: 'strike',
      title: 'Strikethrough',
      icon: Strikethrough,
      isActive: () => e.isActive('strike'),
      command: () => e.chain().focus().toggleStrike().run(),
    },
    {
      action: 'code',
      title: 'Inline Code',
      icon: Code,
      isActive: () => e.isActive('code'),
      command: () => e.chain().focus().toggleCode().run(),
    },
    {
      action: 'link',
      title: 'Link',
      icon: Link,
      isActive: () => e.isActive('link'),
      command: () => {},
    },
  ]

  const loaded = new Set(e.extensionManager.extensions.map(ext => ext.name))
  return allItems.filter(i => loaded.has(i.action))
})
</script>
