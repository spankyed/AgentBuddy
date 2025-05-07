<template>
  <div
    class="relative flex flex-col flex-grow pb-2 bg-neutral-800"
    :class="$style.component"
  >
    <!-- HEADER ROW -->
    <div class="w-full flex items-center my-4 justify-between px-3">
      <!-- ▸ Breadcrumbs (left) -->
      <nav
        v-if="breadcrumbs.length"
        aria-label="Breadcrumb"
        class="flex items-center gap-1 ml-2 text-xs text-neutral-400"
      >
        <template v-for="(crumb, idx) in breadcrumbs" :key="idx">
          <span
            class="cursor-pointer hover:text-white transition-colors"
            @click="onCrumbClick(crumb)"
          >
            {{ crumb.label }}
          </span>
          <!-- separator, skip after last -->
          <ChevronRight
            v-if="idx < breadcrumbs.length - 1"
            :size="12"
            class="mx-1 text-neutral-600"
          />
        </template>
      </nav>

      <!-- ▸ Canvas‑toggle button (right) -->
      <ToggleButton
        @toggle="$emit('canvas-toggle')"
      >
        <template #left-icon>
          <ChevronLeft :size="14" />
        </template>
        {{ label }}
        <template #right-icon>
          <ChevronRight :size="14" />
        </template>
      </ToggleButton>
    </div>

    <!-- MAIN SCROLL AREA -->
    <div class="w-full overflow-y-auto">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import ToggleButton from '@/components/design/ToggleButton.vue'

interface Props {
  label: string
}
defineProps<Props>()
defineEmits<(e: 'canvas-toggle') => void>()

/**
 * ────────────────────────────────────────────────────────────────────────────────
 * Mock breadcrumb state
 * Replace with `useSelector(applicationActor, …)` or props when real data is ready
 * ────────────────────────────────────────────────────────────────────────────────
 */
type Crumb = { label: string; route?: string }
const breadcrumbs = ref<Crumb[]>([
  { label: 'Home', route: '/' },
  { label: 'Projects', route: '/projects' },
  { label: 'Project 42', route: '/projects/42' },
])

function onCrumbClick(crumb: Crumb) {
  // placeholder for navigation logic
  console.log('Navigate to', crumb.route)
}
</script>

<style lang="scss" module>
.component {
  max-height: 45vh;
}
</style>