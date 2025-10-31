<template>
  <div class="link-block mt-2 pt-2 border-t border-neutral-700">
    <div class="flex items-center gap-4 flex-wrap">
      <button
        v-for="(link, index) in links"
        :key="index"
        @click="handleLinkClick(link)"
        class="flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        <component :is="getLinkIcon(link)" class="w-4 h-4" />
        <span>{{ link.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ExternalLink, FileText, MessageSquare, Settings, Link as LinkIcon } from 'lucide-vue-next'
import type { Component } from 'vue'

export type SupportedLinkIcon =
  | 'external-link'
  | 'file-text'
  | 'message-square'
  | 'settings'
  | 'link'

export interface Link {
  label: string
  event: {
    target: 'application' | 'external' | string // 'application', 'external', or plugin name
    data: any
  }
  icon?: SupportedLinkIcon
}

interface Props {
  links: Link[]
}

interface Emits {
  (e: 'navigate', link: Link): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const handleLinkClick = (link: Link) => {
  emit('navigate', link)
}

// Icon name to component mapping
const iconMap: Record<SupportedLinkIcon, Component> = {
  'external-link': ExternalLink,
  'file-text': FileText,
  'message-square': MessageSquare,
  'settings': Settings,
  'link': LinkIcon,
}

const getLinkIcon = (link: Link): Component => {
  if (link.icon) {
    return iconMap[link.icon]
  }
  // Default icon
  return LinkIcon
}
</script>
