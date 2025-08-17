<template>
  <div class="faq-tab">
    <div class="faq-container">
      <h2>Frequently Asked Questions</h2>
      
      <div class="faq-list">
        <div v-for="(item, index) in faqItems" :key="index" class="faq-item">
          <button
            @click="toggleItem(index)"
            :class="['faq-question', { expanded: expandedItems.includes(index) }]"
          >
            <span>{{ item.question }}</span>
            <ChevronDown :class="['chevron', { rotated: expandedItems.includes(index) }]" />
          </button>
          <div v-if="expandedItems.includes(index)" class="faq-answer">
            <p>{{ item.answer }}</p>
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
.faq-tab {
  padding: 2rem;
  overflow: auto;
}

.faq-container {
  max-width: 800px;
  margin: 0 auto;
}

h2 {
  margin-bottom: 2rem;
  color: var(--color-heading);
  text-align: center;
}

.faq-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.faq-item {
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.faq-question {
  width: 100%;
  padding: 1.25rem;
  background: transparent;
  border: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  text-align: left;
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text);
  transition: background 0.2s;
}

.faq-question:hover {
  background: var(--color-background-mute);
}

.faq-question.expanded {
  background: var(--color-background-mute);
}

.chevron {
  width: 20px;
  height: 20px;
  color: var(--color-text-secondary);
  transition: transform 0.3s ease;
  flex-shrink: 0;
}

.chevron.rotated {
  transform: rotate(180deg);
}

.faq-answer {
  padding: 0 1.25rem 1.25rem;
  animation: slideDown 0.3s ease;
}

.faq-answer p {
  margin: 0;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>