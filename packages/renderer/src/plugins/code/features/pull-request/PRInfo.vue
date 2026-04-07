<template>
  <div class="flex flex-col flex-1 overflow-y-auto">
    <div v-if="pr" class="p-3 space-y-3">
      <!-- PR Header -->
      <div class="pb-3 border-b border-neutral-800">
        <div class="flex items-start gap-2">
          <div class="flex-1 min-w-0">
            <span class="text-sm font-medium text-neutral-100 leading-snug">{{ pr.title }}</span>
            <div class="flex items-center gap-1 mt-0.5 text-[11px] text-neutral-600">
              <GitBranch :size="10" class="shrink-0" />
              <span class="truncate" :title="pr.headRefName">{{ pr.headRefName }}</span>
              <ArrowRight :size="10" class="shrink-0" />
              <span class="truncate" :title="pr.baseRefName">{{ pr.baseRefName }}</span>
            </div>
          </div>
          <span class="text-[11px] text-neutral-400 shrink-0 mt-0.5">#{{ pr.number }}</span>
        </div>
        <div class="flex items-center gap-1.5 mt-2 text-[11px] text-neutral-500">
          <span class="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" :class="statusBadgeClass">
            {{ statusLabel }}
          </span>
          <span>&middot;</span>
          <span>{{ pr.author.login }}</span>
          <span>&middot;</span>
          <span>{{ formatDate(pr.createdAt) }}</span>
          <template v-if="pr.commits?.length">
            <span>&middot;</span>
            <span>{{ pr.commits.length }} commit{{ pr.commits.length !== 1 ? 's' : '' }}</span>
          </template>
        </div>
      </div>

      <!-- Loading state -->
      <div v-if="isLoading" class="flex items-center justify-center gap-2 py-6">
        <Loader2 class="w-4 h-4 animate-spin text-neutral-500" />
        <span class="text-xs text-neutral-500">Loading details...</span>
      </div>

      <template v-else>
      <!-- PR Body -->
      <div v-if="pr.body" class="pr-body">
        <TiptapEditor mode="viewer" :modelValue="pr.body" editorClass="pr-markdown" />
      </div>
      <div v-else class="text-xs text-neutral-500 italic">
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
          <TiptapEditor mode="viewer" :modelValue="comment.body" editorClass="pr-markdown" />
        </div>
      </div>
      </template>
    </div>

    <div v-else class="flex items-center justify-center flex-1 text-xs text-neutral-500">
      Select a pull request to view details
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { GitBranch, ArrowRight, MessageSquare, Loader2 } from 'lucide-vue-next'
import TiptapEditor from '@/core/components/tiptap/TiptapEditor.vue'
import type { GhPullRequest, GhPRComment } from '@app/api'

const props = defineProps<{
  pr: GhPullRequest | null
  comments: GhPRComment[]
  isLoading?: boolean
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
:deep(.pr-markdown) {
  font-size: 0.75rem;
  line-height: 1.5;
  color: rgb(212 212 212);
}
:deep(.pr-markdown .tiptap) {
  padding: 0;
}
:deep(.pr-markdown h1),
:deep(.pr-markdown h2),
:deep(.pr-markdown h3) {
  font-size: 0.8rem;
  font-weight: 600;
  margin: 0.5rem 0 0.25rem;
}
</style>
