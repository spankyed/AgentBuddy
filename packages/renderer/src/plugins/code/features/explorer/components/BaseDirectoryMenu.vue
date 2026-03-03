<template>
  <div class="py-1 pl-2 pr-4">
    <div class="flex items-center text-xs min-w-0">
      <DropdownMenuRoot
        :open="menuOpen"
        @update:open="menuOpen = $event"
      >
        <DropdownMenuTrigger as-child>
          <button
            @click.capture="(e: MouseEvent) => { e.stopImmediatePropagation(); menuOpen = true }"
            @contextmenu.prevent="menuOpen = true"
            class="flex items-center gap-1 mx-1 px-1 py-1 transition-all rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 font-medium truncate"
            :title="baseDirectory"
          >
            <ChevronDown :size="14" class="shrink-0" />
            <span class="truncate">{{ directoryName }}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            class="min-w-[160px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50"
            :side-offset="5"
            align="start"
          >
            <DropdownMenuItem
              @select="$emit('open-directory')"
              class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
            >
              <FolderOpen class="w-4 h-4" />
              Open Directory
            </DropdownMenuItem>
            <DropdownMenuSeparator class="h-px my-1 bg-neutral-700" />
            <DropdownMenuItem
              @select="$emit('view-projects')"
              class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
            >
              <Layers class="w-4 h-4" />
              View Projects
            </DropdownMenuItem>
            <ProjectMenuItems
              :directory-path="baseDirectory"
              :show-separator="false"
              :ItemComponent="DropdownMenuItem"
              :SeparatorComponent="DropdownMenuSeparator"
              :SubComponent="DropdownMenuSub"
              :SubTriggerComponent="DropdownMenuSubTrigger"
              :SubContentComponent="DropdownMenuSubContent"
              :PortalComponent="DropdownMenuPortal"
              :CheckboxItemComponent="DropdownMenuCheckboxItem"
              :ItemIndicatorComponent="DropdownMenuItemIndicator"
            />
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItemIndicator,
  DropdownMenuSeparator,
} from 'reka-ui'
import { FolderOpen, Layers, ChevronDown } from 'lucide-vue-next'
import ProjectMenuItems from './ProjectMenuItems.vue'

const props = defineProps<{
  baseDirectory: string
}>()

defineEmits<{
  'view-projects': []
  'open-directory': []
}>()

const menuOpen = ref(false)

const directoryName = computed(() => {
  return props.baseDirectory.split('/').pop() || ''
})
</script>
