<template>
  <div
    class="relative flex flex-col flex-grow border-b bg-neutral-900 border-neutral-800"
    :class="$style.component"
  >
    <!-- HEADER ROW -->
    <div class="flex items-center w-full px-3 pt-4 pb-3 border-b border-neutral-800" :class="[headerClass, menuOpen ? '' : 'canvas-header']">
      <!-- ▸ Breadcrumbs with inline ⋮ menu trigger -->
      <nav
        v-if="breadcrumbs?.length"
        aria-label="Breadcrumb"
        class="flex items-center gap-1 ml-2 text-sm text-neutral-500 no-drag"
        @contextmenu.prevent="menuItems.length > 0 && (menuOpen = true)"
      >
        <DropdownMenuRoot v-model:open="menuOpen">
          <!-- ⋮ icon as part of the breadcrumb row -->
          <DropdownMenuTrigger v-if="menuItems.length > 0" as-child>
            <button
              class="p-0.5 -ml-0.5 mr-1 rounded text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-colors"
              title="Plugin menu"
            >
              <EllipsisVertical :size="14" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              class="min-w-[180px] bg-neutral-800 border border-neutral-700 rounded-md shadow-lg p-1 z-50"
              :side="'bottom'"
              :side-offset="8"
              :align="'start'"
            >
              <PluginMenuItems
                :items="menuItems"
                :ItemComponent="DropdownMenuItem"
                :SeparatorComponent="DropdownMenuSeparator"
                @action="(ev) => $emit('menu-action', ev)"
              />
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>

        <div v-for="(crumb, idx) in breadcrumbs" :key="idx" class="flex items-center">
          <span
            class="text-xs font-semibold tracking-wider uppercase transition-colors cursor-pointer hover:text-white"
            @click="$emit('crumb-click', crumb.target || '')"
          >
            {{ crumb.label }}
          </span>
          <!-- separator, skip after last -->
          <ChevronRight
            v-if="idx < breadcrumbs?.length - 1"
            :size="12"
            class="mx-1 text-neutral-600"
          />
        </div>
      </nav>
    </div>

    <!-- MAIN SCROLL AREA -->
    <div ref="scrollContainer" class="flex-1 w-full overflow-y-auto">
      <slot />
      <button
        v-show="showScrollButton"
        @click="scrollToBottom"
        class="absolute p-2 text-white transition-all duration-200 rounded-full shadow-lg opacity-75 bottom-4 right-4 bg-primary hover:bg-primary-dark hover:opacity-100"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 14l-7 7m0 0l-7-7m7 7V3"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, onUpdated } from 'vue'
import { ChevronRight, EllipsisVertical } from 'lucide-vue-next'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
} from 'reka-ui'
import PluginMenuItems from './PluginMenuItems.vue'
import { onMenuOpenChange } from '@/core/composables/useMenuState'
import type { ContextMenuItem as ContextMenuItemType } from '@/core/context-menu'

const scrollContainer = ref<HTMLElement | null>(null)
const showScrollButton = ref(false)
const menuOpen = ref(false)
watch(menuOpen, onMenuOpenChange)

const checkScroll = () => {
  if (!scrollContainer.value) return
  const { scrollTop, scrollHeight, clientHeight } = scrollContainer.value
  const bottomThreshold = 20 // Show button when not at bottom (with small threshold)
  showScrollButton.value = scrollHeight - (scrollTop + clientHeight) > bottomThreshold
}

const scrollToBottom = () => {
  if (!scrollContainer.value) return
  scrollContainer.value.scrollTo({
    top: scrollContainer.value.scrollHeight,
    behavior: 'smooth'
  })
}

onMounted(() => {
  scrollContainer.value?.addEventListener('scroll', checkScroll)
  // Initial check
  checkScroll()
})

onUnmounted(() => {
  scrollContainer.value?.removeEventListener('scroll', checkScroll)
})

onUpdated(() => {
  checkScroll()
})

interface Props {
  label: string
  breadcrumbs?: { label: string; target?: string }[]
  menuItems?: ContextMenuItemType[]
  headerClass?: string
}
withDefaults(defineProps<Props>(), {
  menuItems: () => [],
})
defineEmits<{
  (e: 'canvas-toggle'): void
  (e: 'crumb-click', target: string): void
  (e: 'menu-action', event: { type: string; [key: string]: any }): void
}>()
</script>

<style lang="scss" module>
.component {
  height: 100%;
}
</style>

<style lang="scss">
/* Make header draggable for window movement */
.canvas-header {
  -webkit-app-region: drag;
  user-select: none;
}

/* Ensure interactive elements remain clickable */
.canvas-header .no-drag,
.canvas-header button,
.canvas-header a,
.canvas-header span[class*="cursor-pointer"] {
  -webkit-app-region: no-drag;
}
</style>
