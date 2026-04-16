<template>
  <div class="flex flex-col h-full">
    <!-- Scrollable content area -->
    <div class="flex-1 min-h-0 overflow-auto p-8">
      <div class="max-w-2xl mx-auto">
        <h2 class="text-2xl font-semibold text-white text-center mb-8">Frequently Asked Questions</h2>

        <div class="space-y-3">
          <div v-for="(item, index) in faqItems" :key="item.id"
            class="bg-neutral-800 border border-neutral-700 rounded-lg overflow-hidden transition-colors hover:border-neutral-600">
            <button
              @click="toggleItem(index)"
              class="w-full px-5 py-4 flex justify-between items-center text-left transition-colors"
              :class="expandedItems.includes(index) ? 'bg-neutral-700/50' : ''"
            >
              <span class="text-sm font-medium" :class="expandedItems.includes(index) ? 'text-white' : 'text-neutral-300'">{{ item.question }}</span>
              <ChevronDown class="w-4 h-4 text-neutral-400 transition-transform duration-200"
                :class="expandedItems.includes(index) ? 'rotate-180' : ''" />
            </button>
            <div v-if="expandedItems.includes(index)" class="px-5 pt-1 pb-4 animate-fadeIn">
              <TiptapEditor mode="viewer" :modelValue="item.answer" editorClass="faq-answer" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Attribution pinned to bottom -->
    <div class="shrink-0 bg-neutral-900 py-4">
      <div class="text-center">
        <p class="text-xs text-neutral-500">
          Developed in memory of
          <a
            href="#"
            @click.prevent="openMemorialLink"
            class="text-neutral-400 hover:text-neutral-300 underline transition-colors"
          >
            Kathie Lovett Ulrich
          </a>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import type { FAQItem } from '@app/api'
import TiptapEditor from '@/core/components/tiptap/TiptapEditor.vue'

const MEMORIAL_URL = 'https://www.postandcourier.com/northaugusta/archive/news/profile-kathie-ulrich/article_d1f14448-0fc8-54df-a1b0-3c404c99cfcc.html'

function openMemorialLink() {
  window.electronAPI?.shell?.openExternal(MEMORIAL_URL)
}

const settingsActor = applicationState.system.get('settings')
const faqItems = useSelector(settingsActor, (state: any): FAQItem[] => state.context.faqs ?? [])

const expandedItems = ref<number[]>([])

const toggleItem = (index: number) => {
  const idx = expandedItems.value.indexOf(index)
  if (idx > -1) {
    expandedItems.value.splice(idx, 1)
  } else {
    expandedItems.value.push(index)
  }
}
</script>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fadeIn {
  animation: fadeIn 0.2s ease-out;
}

:deep(.faq-answer) {
  font-size: 0.8125rem;
  color: rgb(163 163 163);
}
</style>
