<template>
  <ContextMenuRoot v-model:open="contextMenuOpen">
    <ContextMenuTrigger as-child>
      <div
        class="flex items-center gap-1.5 px-2 py-0 min-h-[28px] cursor-pointer group-label flex-shrink-0 transition-all hover:brightness-110 rounded-t-md"
        :style="{
          backgroundColor: !isCollapsed ? `var(--color-${color})` : `color-mix(in srgb, var(--color-${color}) 10%, transparent)`,
          borderBottom: !isCollapsed ? `2px solid var(--color-${color})` : 'none',
          '--text-color': !isCollapsed ? `var(--color-${color}-text)` : 'rgb(156, 163, 175)'
        }"
        @click.stop="$emit('toggle')"
      >
        <span class="text-xs font-medium whitespace-nowrap select-none group-label-text">
          {{ name }}
        </span>

        <DropdownMenuRoot v-model:open="dropdownOpen">
          <DropdownMenuTrigger as-child>
            <button
              @click.stop
              class="flex items-center justify-center w-4 h-4 transition-opacity rounded-sm hover:bg-neutral-700/50"
            >
              <MoreHorizontal class="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuPortal>
            <DropdownMenuContent class="min-w-[180px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50">
              <BrowserGroupMenuItems
                :name="name"
                :ItemComponent="DropdownMenuItem"
                :SeparatorComponent="DropdownMenuSeparator"
                :SubComponent="DropdownMenuSub"
                :SubTriggerComponent="DropdownMenuSubTrigger"
                :SubContentComponent="DropdownMenuSubContent"
                :PortalComponent="DropdownMenuPortal"
                @rename="$emit('rename', $event)"
                @change-color="$emit('change-color', $event)"
                @ungroup-all="$emit('ungroup-all')"
                @close-all="$emit('close-all')"
                @request-close="closeMenus"
              />
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </div>
    </ContextMenuTrigger>

    <ContextMenuPortal>
      <ContextMenuContent class="min-w-[180px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50">
        <BrowserGroupMenuItems
          :name="name"
          :ItemComponent="ContextMenuItem"
          :SeparatorComponent="ContextMenuSeparator"
          :SubComponent="ContextMenuSub"
          :SubTriggerComponent="ContextMenuSubTrigger"
          :SubContentComponent="ContextMenuSubContent"
          :PortalComponent="ContextMenuPortal"
          @rename="$emit('rename', $event)"
          @change-color="$emit('change-color', $event)"
          @ungroup-all="$emit('ungroup-all')"
          @close-all="$emit('close-all')"
          @request-close="closeMenus"
        />
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { MoreHorizontal } from 'lucide-vue-next';
import {
  ContextMenuRoot, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
  ContextMenuPortal, ContextMenuSeparator, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent,
  DropdownMenuRoot, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuPortal, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from 'reka-ui';
import type { TabGroupColor } from '@/shared/tab-groups';
import BrowserGroupMenuItems from './BrowserGroupMenuItems.vue';
import '@/shared/tab-groups/group-colors.css';

defineProps<{
  name: string;
  color: TabGroupColor;
  isCollapsed: boolean;
  groupId: string;
}>();

defineEmits<{
  toggle: [];
  rename: [name: string];
  'change-color': [color: TabGroupColor];
  'ungroup-all': [];
  'close-all': [];
}>();

const dropdownOpen = ref(false);
const contextMenuOpen = ref(false);

const closeMenus = () => {
  dropdownOpen.value = false;
  contextMenuOpen.value = false;
};
</script>

<style scoped>
.group-label-text,
.group-label .w-3.h-3 {
  color: var(--text-color);
}
</style>
