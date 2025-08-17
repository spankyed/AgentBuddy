<template>
  <div class="p-8 overflow-auto">
    <div class="max-w-2xl mx-auto">
      <h2 class="text-2xl font-semibold text-white text-center mb-8">Frequently Asked Questions</h2>
      
      <div class="space-y-3">
        <div v-for="(item, index) in faqItems" :key="index" 
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
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { ChevronDown } from 'lucide-vue-next'

const actor = applicationState.system.get('settings')

const settings = useSelector(actor, (state: any) => state.context.settings)

const faqItems = computed(() => {
  return settings.value?.faq?.items || [
    {
      question: "Where can I view saved messages?",
      answer: "In the database plugin click 3 dots then select option 'view trace history'"
    },
    {
      question: "How do I enable TTS?",
      answer: "Go to mac settings and allow accessibility permission"
    }
  ]
})

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
