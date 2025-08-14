<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <button 
        class="flex items-center justify-center px-3 py-1.5 text-sm rounded-md bg-neutral-900/90 border border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100 transition-all backdrop-blur-sm"
        title="Menu options"
      >
        <Menu :size="16" class="mr-1.5" />
        <span>Menu</span>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent 
        class="bg-neutral-800 border border-neutral-700 rounded-md p-1 min-w-[200px] shadow-xl" 
        :side="'bottom'" 
        :side-offset="8"
      >
        <!-- View Options Section -->
        <DropdownMenuItem 
          class="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer text-neutral-50 hover:bg-neutral-700 transition-colors" 
          @select="$emit('toggle-left-panel')"
        >
          <div class="flex items-center gap-2 flex-1">
            <Layers :size="16" class="text-primary-400" />
            Event Trace
          </div>
          <Check v-if="showLeftPanel" :size="14" class="text-emerald-400" />
        </DropdownMenuItem>
        <DropdownMenuItem 
          class="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer text-neutral-50 hover:bg-neutral-700 transition-colors" 
          @select="$emit('toggle-right-panel')"
        >
          <div class="flex items-center gap-2 flex-1">
            <Activity :size="16" class="text-primary-400" />
            Watched Events
          </div>
          <Check v-if="showRightPanel" :size="14" class="text-emerald-400" />
        </DropdownMenuItem>
        
        <!-- Divider -->
        <DropdownMenuSeparator class="h-[1px] bg-neutral-700 my-1" />
        
        <!-- Debug Options Section -->
        <DropdownMenuItem 
          class="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer text-neutral-50 hover:bg-neutral-700 transition-colors" 
          @select="$emit('toggle-debug')"
        >
          <div class="flex items-center gap-2 flex-1">
            <Terminal :size="16" class="text-yellow-400" />
            Brain Debug Logs
          </div>
          <Check v-if="debugEnabled" :size="14" class="text-emerald-400" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup lang="ts">
import { Menu, Layers, Activity, Check, Terminal } from 'lucide-vue-next';
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuPortal,
} from 'reka-ui';

interface Props {
  showLeftPanel?: boolean;
  showRightPanel?: boolean;
  debugEnabled?: boolean;
}

defineProps<Props>();

defineEmits<{
  'toggle-left-panel': [];
  'toggle-right-panel': [];
  'toggle-debug': [];
}>();
</script>