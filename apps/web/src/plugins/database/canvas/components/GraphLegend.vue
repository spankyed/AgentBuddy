<template>
  <div class="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
    <div class="flex items-center gap-4 overflow-x-auto text-xs scrollbar-thin">
      <TransitionGroup
        name="legend"
        tag="div"
        class="flex items-center gap-3"
      >
        <div 
          v-for="(color, type) in colors" 
          :key="type" 
          class="flex items-center gap-1.5 flex-shrink-0 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
        >
          <div 
            class="w-3 h-3 rounded-full ring-1 ring-gray-300 dark:ring-gray-600" 
            :style="{ backgroundColor: color }"
          />
          <span class="text-gray-600 dark:text-gray-400">{{ type }}</span>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  colors: Record<string, string>;
}

defineProps<Props>();
</script>

<style scoped>
.scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: theme('colors.gray.300') transparent;
}

.scrollbar-thin::-webkit-scrollbar {
  height: 6px;
}

.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}

.scrollbar-thin::-webkit-scrollbar-thumb {
  background-color: theme('colors.gray.300');
  border-radius: 3px;
}

.dark .scrollbar-thin::-webkit-scrollbar-thumb {
  background-color: theme('colors.gray.600');
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