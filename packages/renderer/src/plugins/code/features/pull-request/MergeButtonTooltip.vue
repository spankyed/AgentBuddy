<template>
  <div class="w-72 rounded border border-neutral-700 bg-neutral-900 p-3 shadow-xl text-xs">
    <!-- Header -->
    <div class="flex items-start gap-2">
      <component :is="headerIcon" :size="14" :class="[headerIconClass, 'mt-0.5 shrink-0']" />
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-neutral-100">{{ headerTitle }}</div>
        <div class="text-neutral-400 mt-0.5 leading-snug">{{ headerDescription }}</div>
      </div>
    </div>

    <!-- Check list -->
    <div v-if="relevantChecks.length > 0" class="mt-2 border-t border-neutral-800 pt-2 space-y-1">
      <div
        v-for="check in relevantChecks.slice(0, 5)"
        :key="check.name || Math.random()"
        class="flex items-center gap-1.5 text-neutral-300"
      >
        <component :is="checkIcon(check)" :size="10" :class="[checkIconClass(check), 'shrink-0']" />
        <span class="truncate flex-1">{{ check.name || 'Unnamed check' }}</span>
        <span class="text-neutral-500 text-[10px] shrink-0">{{ checkLabel(check) }}</span>
      </div>
      <div v-if="relevantChecks.length > 5" class="text-neutral-500 text-[10px] pl-[18px]">
        +{{ relevantChecks.length - 5 }} more
      </div>
    </div>

    <!-- Action hint -->
    <div v-if="actionHint" class="mt-2 text-neutral-400 text-[10px] italic">{{ actionHint }}</div>

    <!-- Branch footer -->
    <div
      v-if="pr"
      class="mt-2 border-t border-neutral-800 pt-2 text-neutral-500 text-[10px] flex items-center gap-1"
    >
      <GitBranch :size="10" class="shrink-0" />
      <span class="truncate">{{ pr.headRefName }}</span>
      <ArrowRight :size="10" class="shrink-0" />
      <span class="truncate">{{ pr.baseRefName }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  CheckCircle2, Loader2, AlertTriangle, Ban, XCircle,
  GitBranch, ArrowRight,
} from 'lucide-vue-next'
import type { GhPullRequest } from '@app/api'
import { isFailing, isPending, PENDING_STATUSES, type StatusCheck } from './merge-checks'

export type MergeVariant = 'clean' | 'merging' | 'blocked' | 'error' | 'pending'

const props = defineProps<{
  variant: MergeVariant
  pr: GhPullRequest | null
}>()

const headerIcon = computed(() => {
  switch (props.variant) {
    case 'clean':   return CheckCircle2
    case 'merging': return Loader2
    case 'pending': return Loader2
    case 'error':   return AlertTriangle
    case 'blocked': return Ban
  }
})

const headerIconClass = computed(() => {
  switch (props.variant) {
    case 'clean':   return 'text-green-400'
    case 'merging': return 'text-green-400 animate-spin'
    case 'pending': return 'text-amber-400 animate-spin'
    case 'error':   return 'text-red-400'
    case 'blocked': return 'text-neutral-400'
  }
})

const headerTitle = computed(() => {
  const pr = props.pr
  switch (props.variant) {
    case 'clean':   return 'Ready to merge'
    case 'merging': return 'Merging…'
    case 'pending':
      if (pr?.mergeable === 'UNKNOWN' || pr?.mergeStateStatus === 'UNKNOWN') return 'Checking mergeability'
      return 'Status checks running'
    case 'error':
      if (pr?.mergeable === 'CONFLICTING' || pr?.mergeStateStatus === 'DIRTY') return 'Merge conflicts'
      if (pr?.reviewDecision === 'CHANGES_REQUESTED') return 'Changes requested'
      return 'Status checks failing'
    case 'blocked':
      if (!pr) return 'No pull request selected'
      if (pr.isDraft) return 'Draft pull request'
      if (pr.mergeStateStatus === 'BEHIND') return 'Branch is out of date'
      if (pr.reviewDecision === 'REVIEW_REQUIRED') return 'Required review missing'
      if (pr.mergeStateStatus === 'BLOCKED') return 'Blocked by branch protection'
      return 'Cannot merge'
  }
})

const headerDescription = computed(() => {
  const pr = props.pr
  const base = pr?.baseRefName ?? 'the base branch'
  switch (props.variant) {
    case 'clean':   return 'All checks passed and no blockers.'
    case 'merging': return 'Your merge is in progress.'
    case 'pending':
      if (pr?.mergeable === 'UNKNOWN' || pr?.mergeStateStatus === 'UNKNOWN')
        return 'GitHub is computing whether this PR can be merged. Try refreshing in a moment.'
      return 'Waiting for required status checks to complete.'
    case 'error':
      if (pr?.mergeable === 'CONFLICTING' || pr?.mergeStateStatus === 'DIRTY')
        return `This branch has conflicts with ${base}. Resolve them locally and push.`
      if (pr?.reviewDecision === 'CHANGES_REQUESTED')
        return 'A reviewer has requested changes. Address them before merging.'
      return 'One or more required status checks have failed.'
    case 'blocked':
      if (!pr) return 'Open a pull request for this branch to enable merging.'
      if (pr.isDraft) return 'Mark this PR as ready for review to enable merge.'
      if (pr.mergeStateStatus === 'BEHIND')
        return `Update this branch with the latest from ${base} before merging.`
      if (pr.reviewDecision === 'REVIEW_REQUIRED')
        return 'This PR requires an approving review before it can be merged.'
      if (pr.mergeStateStatus === 'BLOCKED')
        return "This repository's branch protection rules are blocking the merge."
      return 'This pull request cannot be merged right now.'
  }
})

const actionHint = computed<string | null>(() => {
  if (props.variant === 'blocked' && props.pr?.isDraft) {
    return 'Click Ready to the right to mark as ready for review.'
  }
  return null
})

const relevantChecks = computed<StatusCheck[]>(() => {
  const checks = props.pr?.statusCheckRollup ?? []
  if (props.variant === 'error') return checks.filter(isFailing)
  if (props.variant === 'pending') return checks.filter(isPending)
  return []
})

const checkIcon = (c: StatusCheck) => {
  if (c.status && PENDING_STATUSES.has(c.status) && !c.conclusion) return Loader2
  if (!c.status && c.state === 'PENDING') return Loader2
  return XCircle
}

const checkIconClass = (c: StatusCheck) => {
  if (c.status && PENDING_STATUSES.has(c.status) && !c.conclusion) return 'text-amber-400 animate-spin'
  if (!c.status && c.state === 'PENDING') return 'text-amber-400 animate-spin'
  return 'text-red-400'
}

const checkLabel = (c: StatusCheck): string => {
  const raw = c.conclusion || c.status || c.state || ''
  return raw.toLowerCase().replace(/_/g, ' ')
}
</script>
