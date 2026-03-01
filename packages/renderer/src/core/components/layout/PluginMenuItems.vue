<template>
  <template v-for="(item, idx) in items" :key="idx">
    <component
      :is="SeparatorComponent"
      v-if="item.separator"
      class="h-[1px] bg-neutral-700 my-1"
    />
    <component
      :is="ItemComponent"
      class="flex items-center gap-2 px-3 py-2 text-sm rounded outline-none cursor-pointer text-neutral-50 hover:bg-neutral-700 focus:bg-neutral-700 transition-colors"
      @select="$emit('action', item.event)"
    >
      <component
        v-if="item.icon"
        :is="item.icon"
        :size="16"
        class="flex-shrink-0"
        :class="item.iconColor"
      />
      <span class="flex-1">{{ item.label }}</span>
      <Check v-if="item.isActive" :size="14" class="text-emerald-400" />
    </component>
  </template>
</template>

<script setup lang="ts">
import { Check } from 'lucide-vue-next';
import type { ContextMenuItem } from '@/core/context-menu';

defineProps<{
  items: ContextMenuItem[];
  ItemComponent: any;
  SeparatorComponent: any;
}>();

defineEmits<{
  action: [event: { type: string; [key: string]: any }];
}>();
</script>
