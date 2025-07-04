<template>
  <div
    class="relative flex flex-col flex-grow border-b bg-neutral-900 border-neutral-800"
    :class="$style.component"
  >
    <!-- HEADER ROW -->
    <div class="flex items-center w-full px-3 pt-4 pb-3 border-b border-neutral-800" :class="headerClass">
      <!-- ▸ Breadcrumbs (left) -->
      <nav
        v-if="breadcrumbs?.length"
        aria-label="Breadcrumb"
        class="flex items-center gap-1 ml-2 text-sm text-neutral-500"
      >
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

      <!-- ▸ Canvas‑toggle button (right) (disabled 6/1/25)-->
      <!-- <div class="ml-auto" >
        <ToggleButton
          @toggle="$emit('canvas-toggle')"
        >
          {{ label }}
        </ToggleButton>
      </div> -->
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
import { ref, onMounted, onUnmounted, onUpdated } from 'vue'
// import ToggleButton from '@/core/design/toggle-button.vue'
import { ChevronRight } from 'lucide-vue-next'

const scrollContainer = ref<HTMLElement | null>(null)
const showScrollButton = ref(false)

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
  headerClass?: string
}
defineProps<Props>()
defineEmits<{
  (e: 'canvas-toggle'): void
  (e: 'crumb-click', target: string): void
}>()
</script>

<style lang="scss" module>
.component {
  height: 45vh;
}
</style>