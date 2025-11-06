<template>
  <div class="review-display-block space-y-3 p-4 bg-neutral-900 rounded-lg border border-neutral-700">
    <div v-if="reviewContent.title" class="border-b border-neutral-700 pb-3">
      <h3 class="text-lg font-semibold text-neutral-100">{{ reviewContent.title }}</h3>
    </div>

    <div v-if="reviewContent.summary" class="text-neutral-300">
      <p class="text-sm">{{ reviewContent.summary }}</p>
    </div>

    <div v-if="reviewContent.items && reviewContent.items.length > 0" class="space-y-2">
      <div
        v-for="(item, index) in reviewContent.items"
        :key="index"
        class="p-3 rounded-lg border"
        :class="getItemClasses(item.type)"
      >
        <div class="flex items-start gap-2">
          <component :is="getItemIcon(item.type)" class="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div class="flex-1">
            <p class="text-sm font-medium">{{ item.title }}</p>
            <p v-if="item.description" class="text-sm mt-1 opacity-90">{{ item.description }}</p>
          </div>
        </div>
      </div>
    </div>

    <div v-if="reviewContent.conclusion" class="pt-3 border-t border-neutral-700">
      <p class="text-sm text-neutral-300">{{ reviewContent.conclusion }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CheckCircle, AlertCircle, Info, XCircle } from 'lucide-vue-next'

interface ReviewItem {
  type: 'success' | 'warning' | 'error' | 'info'
  title: string
  description?: string
}

interface ReviewContent {
  title?: string
  summary?: string
  items?: ReviewItem[]
  conclusion?: string
}

interface Props {
  reviewContent: ReviewContent
}

defineProps<Props>()

const getItemIcon = (type: ReviewItem['type']) => {
  switch (type) {
    case 'success':
      return CheckCircle
    case 'warning':
      return AlertCircle
    case 'error':
      return XCircle
    case 'info':
    default:
      return Info
  }
}

const getItemClasses = (type: ReviewItem['type']) => {
  switch (type) {
    case 'success':
      return 'bg-green-950/30 border-green-700/50 text-green-300'
    case 'warning':
      return 'bg-yellow-950/30 border-yellow-700/50 text-yellow-300'
    case 'error':
      return 'bg-red-950/30 border-red-700/50 text-red-300'
    case 'info':
    default:
      return 'bg-blue-950/30 border-blue-700/50 text-blue-300'
  }
}
</script>
