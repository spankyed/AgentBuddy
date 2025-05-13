<template>
  <div
    class="relative flex flex-col flex-grow pb-2 bg-neutral-800"
    :class="$style.component"
  >
    <!-- HEADER ROW -->
    <div class="flex items-center w-full px-3 my-4">
      <!-- ▸ Breadcrumbs (left) -->
      <nav
        v-if="breadcrumbs?.length"
        aria-label="Breadcrumb"
        class="flex items-center gap-1 ml-2 text-sm text-neutral-400"
      >
        <div v-for="(crumb, idx) in breadcrumbs" :key="idx" class="flex items-center">
          <span
            class="transition-colors cursor-pointer hover:text-white"
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

      <!-- ▸ Canvas‑toggle button (right) -->
      <div class="ml-auto" >
        <ToggleButton
          @toggle="$emit('canvas-toggle')"
        >
          {{ label }}
        </ToggleButton>
      </div>
    </div>

    <!-- MAIN SCROLL AREA -->
    <div class="w-full overflow-y-auto">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
import ToggleButton from '@/shared/design/toggle-button.vue'

interface Props {
  label: string
  breadcrumbs?: { label: string; target?: string }[]
}
defineProps<Props>()
defineEmits<{
  (e: 'canvas-toggle'): void
  (e: 'crumb-click', target: string): void
}>()
</script>

<style lang="scss" module>
.component {
  max-height: 45vh;
}
</style>