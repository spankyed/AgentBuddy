<template>
  <div class="flex flex-col flex-1 overflow-y-auto">
    <div v-if="pr" class="p-3 space-y-3">
      <!-- PR Header -->
      <div>
        <div class="flex items-center gap-2 mb-1">
          <span class="text-xs font-medium text-neutral-200">{{ pr.title }}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" :class="statusBadgeClass">
            {{ statusLabel }}
          </span>
        </div>
        <div class="flex items-center gap-2 text-[10px] text-neutral-500">
          <span>#{{ pr.number }}</span>
          <span>by {{ pr.author.login }}</span>
          <span>{{ formatDate(pr.createdAt) }}</span>
        </div>
        <div class="flex items-center gap-1 mt-1 text-[10px] text-neutral-500">
          <GitBranch :size="10" />
          <span>{{ pr.headRefName }}</span>
          <ArrowRight :size="10" />
          <span>{{ pr.baseRefName }}</span>
        </div>
      </div>

      <!-- PR Body -->
      <div v-if="pr.body" class="pr-body text-xs text-neutral-300 border-t border-neutral-800 pt-3">
        <div v-html="renderedBody" class="prose prose-invert prose-xs max-w-none" />
      </div>
      <div v-else class="text-xs text-neutral-500 italic border-t border-neutral-800 pt-3">
        No description provided.
      </div>

      <!-- Comments -->
      <div class="border-t border-neutral-800 pt-3">
        <div class="flex items-center gap-1.5 mb-2">
          <MessageSquare :size="12" class="text-neutral-500" />
          <span class="text-xs text-neutral-400">
            {{ comments.length }} comment{{ comments.length !== 1 ? 's' : '' }}
          </span>
        </div>

        <div v-if="comments.length === 0" class="text-xs text-neutral-500 italic">
          No comments yet.
        </div>

        <div
          v-for="(comment, i) in comments"
          :key="i"
          class="mb-3 last:mb-0"
        >
          <div class="flex items-center gap-2 mb-1">
            <span class="text-[11px] font-medium text-neutral-300">{{ comment.author.login }}</span>
            <span class="text-[10px] text-neutral-600">{{ formatDate(comment.createdAt) }}</span>
          </div>
          <div v-html="renderMarkdown(comment.body)" class="text-xs text-neutral-400 prose prose-invert prose-xs max-w-none" />
        </div>
      </div>
    </div>

    <div v-else class="flex items-center justify-center flex-1 text-xs text-neutral-500">
      Select a pull request to view details
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { GitBranch, ArrowRight, MessageSquare } from 'lucide-vue-next'
import type { GhPullRequest, GhPRComment } from '@app/api'

const props = defineProps<{
  pr: GhPullRequest | null
  comments: GhPRComment[]
}>()

const statusLabel = computed(() => {
  if (!props.pr) return ''
  if (props.pr.isDraft) return 'Draft'
  return props.pr.state === 'OPEN' ? 'Open' : props.pr.state
})

const statusBadgeClass = computed(() => {
  if (!props.pr) return ''
  if (props.pr.isDraft) return 'bg-neutral-700 text-neutral-300'
  if (props.pr.state === 'OPEN') return 'bg-green-900/50 text-green-400'
  if (props.pr.state === 'MERGED') return 'bg-purple-900/50 text-purple-400'
  return 'bg-red-900/50 text-red-400'
})

const renderedBody = computed(() => renderMarkdown(props.pr?.body || ''))

function renderMarkdown(text: string): string {
  // Lightweight markdown rendering — handles common patterns
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-neutral-800 text-neutral-300">$1</code>')
    .replace(/\n/g, '<br>')
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60))
      if (diffMins <= 0) return 'just now'
      return `${diffMins}m ago`
    }
    return `${diffHours}h ago`
  }
  if (diffDays < 30) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
</script>

<style scoped>
.prose-xs {
  font-size: 0.75rem;
  line-height: 1.4;
}
.prose-xs h1, .prose-xs h2, .prose-xs h3 {
  font-size: 0.8rem;
  font-weight: 600;
  margin: 0.5rem 0 0.25rem;
}
</style>
