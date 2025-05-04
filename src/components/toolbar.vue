<template>
  <div class="flex flex-col w-16 h-full py-4 text-white border-r border-neutral-800">
    <div class="flex flex-col h-full">
      <!-- Scrollable section -->
      <div class="flex-1 overflow-y-auto scrollbar-hide">
        <div class="flex flex-col items-center space-y-6">
          <button
            v-for="item in pluginItems"
            :key="item.id"
            :class="[
              'p-2 rounded-lg transition-all duration-200 ease-in-out',
              activePlugin.id === item.id
                ? 'bg-primary-600 text-white'
                : 'text-neutral-400 hover:text-white hover:bg-primary-700'
            ]"
            @click="$emit('select-plugin', item.id)"
            :title="item.label"
          >
            <component :is="item.icon" :size="24" />
          </button>
        </div>
      </div>

      <!-- Pinned bottom section -->
      <div class="flex flex-col items-center space-y-6 mt-auto pt-6">
        <button
          v-for="item in pinnedItems"
          :key="item.id"
          :class="[
            'p-2 rounded-lg transition-all duration-200 ease-in-out',
            activePlugin.id === item.id
              ? 'bg-primary-600 text-white'
              : 'text-neutral-400 hover:text-white hover:bg-primary-700'
          ]"
          @click="$emit('select-plugin', item.id)"
          :title="item.label"
        >
          <component :is="item.icon" :size="24" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSelector } from '@xstate/vue';
import { applicationActor } from '@/state/application';
import type { Plugin } from '@/plugins';
import { computed } from 'vue';

defineEmits<(e: 'select-plugin', pluginId: string) => void>();

interface ToolbarProps {
  activePlugin: Plugin;
  plugins: Plugin[];
}

const props = defineProps<ToolbarProps>();

const pluginItems = computed(() => props.plugins.filter((item) => !item.isPinned));
const pinnedItems = computed(() => props.plugins.filter((item) => item.isPinned));
</script>

<style lang="scss" module>
.scrollbar-hide {
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;  /* Chrome, Safari and Opera */
}
</style> 