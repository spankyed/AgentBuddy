<template>
  <div class="link-block mt-2 pt-2 border-t border-neutral-700">
    <div class="flex items-center gap-4 flex-wrap">
      <button
        v-for="(link, index) in links"
        :key="index"
        @click="handleLinkClick(link)"
        class="flex items-center gap-1.5 text-sm text-primary-400 hover:text-primary-400 transition-colors"
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
import { useApplicationActor, navigateToPlugin } from '@abuddy/sdk/fe'

export type SupportedLinkIcon =
  | 'external-link'
  | 'file-text'
  | 'message-square'
  | 'settings'
  | 'link'

export interface Link {
  label: string
  event: {
    target: 'application' | 'external' | string
    data: any
  }
  icon?: SupportedLinkIcon
}

interface Props {
  links: Link[]
}

defineProps<Props>()

const appActor = useApplicationActor()

const handleLinkClick = (link: Link) => {
  const { target, data } = link.event
  if (target === 'application') {
    appActor.send(data)
  } else if (target === 'external') {
    window.open(data.url, '_blank')
  } else {
    navigateToPlugin(target, data)
  }
}

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
  return LinkIcon
}
</script>
