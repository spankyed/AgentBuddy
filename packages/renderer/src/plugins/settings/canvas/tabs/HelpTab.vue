<template>
  <div class="relative h-full">
    <!-- Scrollable content area -->
    <div class="p-8 overflow-auto pb-20">
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
            <div v-if="expandedItems.includes(index)" class="px-5 pb-4 animate-fadeIn">
              <p class="text-sm text-neutral-400 leading-relaxed">{{ item.answer }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Fixed attribution at bottom -->
    <div class="absolute bottom-0 left-0 right-0 bg-neutral-900 py-4">
      <div class="text-center">
        <p class="text-xs text-neutral-500">
          Developed in memory of 
          <a 
            href="https://www.postandcourier.com/northaugusta/archive/news/profile-kathie-ulrich/article_d1f14448-0fc8-54df-a1b0-3c404c99cfcc.html" 
            target="_blank" 
            rel="noopener noreferrer"
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

interface FAQItem {
  id: string
  question: string
  answer: string
  category?: string
  order?: number
}

// For now, hardcode the FAQ items until FAQ entities are properly set up
const faqItems = ref<FAQItem[]>([
  {
    id: 'faq_1',
    question: "Where can I view saved messages?",
    answer: "In the database plugin click 3 dots then select option 'view trace history'",
    category: 'database',
    order: 1
  },
  {
    id: 'faq_2', 
    question: "How do I enable TTS?",
    answer: "Go to mac settings and allow accessibility permission",
    category: 'settings',
    order: 2
  }
])

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
</style>
