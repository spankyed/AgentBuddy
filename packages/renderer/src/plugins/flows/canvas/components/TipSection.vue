<template>
  <div class="border-t border-neutral-700 bg-neutral-900/30">
    <button
      @click="isExpanded = !isExpanded"
      class="w-full px-3 py-2 flex items-center justify-between text-xs font-medium text-neutral-400 hover:text-neutral-300 hover:bg-neutral-800/30 transition-colors"
    >
      <span class="flex items-center gap-2">
        <svg 
          :class="['w-3 h-3 transition-transform', isExpanded ? 'rotate-90' : '']"
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
        <span>Example Values</span>
      </span>
      <span class="text-neutral-500">Click to {{ isExpanded ? 'collapse' : 'expand' }}</span>
    </button>
    <Transition name="collapse">
      <div v-if="isExpanded" class="p-3 pt-0">
        <div class="grid grid-cols-2 gap-4">
        <div v-for="category in exampleCategories" :key="category.label">
          <div class="text-xs font-semibold text-neutral-300 mb-2 uppercase tracking-wider">{{ category.label }}</div>
          <div class="space-y-1.5">
            <div
              v-for="(example, index) in category.examples"
              :key="index"
              class="group relative flex items-center gap-2 px-2.5 py-2 rounded-md bg-neutral-800/70 hover:bg-neutral-800 border border-neutral-700/50 hover:border-neutral-600 transition-all cursor-pointer"
              @click="copyToClipboard(example)"
            >
              <code 
                class="flex-1 text-xs font-mono text-emerald-400 select-all"
              >
                {{ example }}
              </code>
              <button
                @click.stop="copyToClipboard(example)"
                class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-neutral-700 transition-all"
                :title="`Copy ${example}`"
              >
                <svg 
                  v-if="copiedText !== example"
                  class="w-3 h-3 text-neutral-400"
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <svg 
                  v-else
                  class="w-3 h-3 text-green-400"
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </Transition>
    
    <Transition name="fade">
      <div 
        v-if="showCopyFeedback"
        class="fixed bottom-4 right-4 px-3 py-2 bg-neutral-700 text-neutral-200 text-xs rounded-lg shadow-lg z-50"
      >
        Copied to clipboard!
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface ExampleCategory {
  label: string
  examples: string[]
}

interface Props {
  exampleCategories?: ExampleCategory[]
  startExpanded?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  startExpanded: false,
  exampleCategories: () => [
    {
      label: 'JSONPath Expressions',
      examples: ['$.event.data.text', '$.lastStep.result', '$.context.userId', '$.items[0].name']
    },
    {
      label: 'Literal Values',
      examples: ['"hello"', '123', 'true', '["item1", "item2"]']
    },
    {
      label: 'Available Context',
      examples: ['$.event.type', '$.event.data', '$.event.timestamp', '$.lastStep.result', '$.lastStep.id', '$.lastStep.label', '$.steps']
    }
  ]
})

const isExpanded = ref(props.startExpanded)
const copiedText = ref<string | null>(null)
const showCopyFeedback = ref(false)
let feedbackTimeout: NodeJS.Timeout | null = null
let copiedTimeout: NodeJS.Timeout | null = null

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    copiedText.value = text
    showCopyFeedback.value = true
    
    if (feedbackTimeout) clearTimeout(feedbackTimeout)
    if (copiedTimeout) clearTimeout(copiedTimeout)
    
    feedbackTimeout = setTimeout(() => {
      showCopyFeedback.value = false
    }, 2000)
    
    copiedTimeout = setTimeout(() => {
      copiedText.value = null
    }, 2500)
  } catch (err) {
    console.error('Failed to copy text:', err)
  }
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  opacity: 1;
  max-height: 500px;
}
</style>