<template>
  <div v-if="mode !== 'viewer'" class="flex items-center gap-0.5 px-2 py-1 border-b border-neutral-700">
    <button
      v-for="item in toolbarItems"
      :key="item.action"
      type="button"
      class="p-1.5 rounded hover:bg-neutral-700 transition-colors text-neutral-400 hover:text-neutral-200"
      :class="{ 'bg-neutral-700 text-neutral-100': item.isActive?.() }"
      :title="item.title"
      @click="item.command"
    >
      <component :is="item.icon" :size="16" />
    </button>

    <!-- Divider between groups (editor mode only) -->
    <template v-if="mode === 'editor'">
      <div class="w-px h-5 mx-1 bg-neutral-700" />
      <button
        v-for="item in extraItems"
        :key="item.action"
        type="button"
        class="p-1.5 rounded hover:bg-neutral-700 transition-colors text-neutral-400 hover:text-neutral-200"
        :class="{ 'bg-neutral-700 text-neutral-100': item.isActive?.() }"
        :title="item.title"
        @click="item.command"
      >
        <component :is="item.icon" :size="16" />
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import type { TiptapMode } from './extensions'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  CodeSquare,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Minus,
  ListChecks,
} from 'lucide-vue-next'

const props = defineProps<{
  editor: Editor | undefined
  mode: TiptapMode
}>()

interface ToolbarItem {
  action: string
  title: string
  icon: typeof Bold
  isActive?: () => boolean
  command: () => void
}

const toolbarItems = computed<ToolbarItem[]>(() => {
  const e = props.editor
  if (!e) return []

  return [
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
      command: () => {
        if (e.isActive('link')) {
          e.chain().focus().unsetLink().run()
        } else {
          const url = window.prompt('Enter URL')
          if (url) {
            e.chain().focus().setLink({ href: url }).run()
          }
        }
      },
    },
    {
      action: 'codeBlock',
      title: 'Code Block',
      icon: CodeSquare,
      isActive: () => e.isActive('codeBlock'),
      command: () => e.chain().focus().toggleCodeBlock().run(),
    },
  ]
})

const extraItems = computed<ToolbarItem[]>(() => {
  const e = props.editor
  if (!e) return []

  return [
    {
      action: 'h1',
      title: 'Heading 1',
      icon: Heading1,
      isActive: () => e.isActive('heading', { level: 1 }),
      command: () => e.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      action: 'h2',
      title: 'Heading 2',
      icon: Heading2,
      isActive: () => e.isActive('heading', { level: 2 }),
      command: () => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      action: 'bulletList',
      title: 'Bullet List',
      icon: List,
      isActive: () => e.isActive('bulletList'),
      command: () => e.chain().focus().toggleBulletList().run(),
    },
    {
      action: 'orderedList',
      title: 'Ordered List',
      icon: ListOrdered,
      isActive: () => e.isActive('orderedList'),
      command: () => e.chain().focus().toggleOrderedList().run(),
    },
    {
      action: 'taskList',
      title: 'Task List',
      icon: ListChecks,
      isActive: () => e.isActive('taskList'),
      command: () => e.chain().focus().toggleTaskList().run(),
    },
    {
      action: 'blockquote',
      title: 'Blockquote',
      icon: Quote,
      isActive: () => e.isActive('blockquote'),
      command: () => e.chain().focus().toggleBlockquote().run(),
    },
    {
      action: 'hr',
      title: 'Horizontal Rule',
      icon: Minus,
      command: () => e.chain().focus().setHorizontalRule().run(),
    },
  ]
})
</script>
