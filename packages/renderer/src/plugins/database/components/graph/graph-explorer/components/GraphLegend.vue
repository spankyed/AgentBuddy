<template>
  <div class="relative px-4 py-3 border-t border-neutral-800 dark:border-gray-700 bg-neutral-900 dark:bg-gray-900">
    <!-- Left scroll indicator -->
    <div 
      v-if="canScrollLeft" 
      class="absolute top-0 bottom-0 left-0 z-10 flex items-center justify-center w-8 transition-opacity cursor-pointer opacity-80 hover:opacity-100 bg-gradient-to-r from-gray-50 dark:from-gray-900 to-transparent"
      @click="scrollToStart"
    >
      <svg class="w-3 h-3 text-neutral-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
    </div>

    <div ref="scrollContainer" class="flex items-center gap-4 overflow-x-auto text-xs scrollbar-thin" @scroll="updateScrollState">
      <TransitionGroup
        name="legend"
        tag="div"
        class="flex items-center gap-3"
      >
        <div 
          v-for="(color, type) in colors" 
          :key="type" 
          class="flex items-center gap-1.5 flex-shrink-0 px-2 py-1 rounded hover:bg-neutral-600 dark:hover:bg-gray-800 transition-colors"
        >
          <div 
            class="w-3 h-3 rounded-full ring-1 ring-neutral-700 dark:ring-gray-600" 
            :style="{ backgroundColor: color }"
          />
          <span class="text-neutral-400 dark:text-neutral-400">{{ type }}</span>
        </div>
      </TransitionGroup>
    </div>

    <!-- Right scroll indicator -->
    <div 
      v-if="canScrollRight" 
      class="absolute top-0 bottom-0 right-0 z-10 flex items-center justify-center w-8 transition-opacity cursor-pointer opacity-80 hover:opacity-100 bg-gradient-to-l from-gray-50 dark:from-gray-900 to-transparent"
      @click="scrollToEnd"
    >
      <svg class="w-3 h-3 text-neutral-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

interface Props {
  colors: Record<string, string>;
}

defineProps<Props>();

const scrollContainer = ref<HTMLElement>();
const canScrollLeft = ref(false);
const canScrollRight = ref(false);

function updateScrollState() {
  if (!scrollContainer.value) return;
  
  const { scrollLeft, scrollWidth, clientWidth } = scrollContainer.value;
  canScrollLeft.value = scrollLeft > 0;
  canScrollRight.value = scrollLeft + clientWidth < scrollWidth - 1;
}

function scrollToStart() {
  scrollContainer.value?.scrollTo({ left: 0, behavior: 'smooth' });
}

function scrollToEnd() {
  if (!scrollContainer.value) return;
  scrollContainer.value.scrollTo({ 
    left: scrollContainer.value.scrollWidth, 
    behavior: 'smooth' 
  });
}

onMounted(() => {
  updateScrollState();
  window.addEventListener('resize', updateScrollState);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateScrollState);
});
</script>

<style scoped>
.scrollbar-thin {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.scrollbar-thin::-webkit-scrollbar {
  display: none;
}

.legend-enter-active,
.legend-leave-active {
  transition: all 0.3s ease;
}

.legend-enter-from {
  opacity: 0;
  transform: translateX(-10px);
}

.legend-leave-to {
  opacity: 0;
  transform: translateX(10px);
}
</style> 