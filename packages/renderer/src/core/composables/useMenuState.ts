import { ref, computed, watch, onBeforeUnmount, type Ref } from 'vue'

const openCount = ref(0)

export const isAnyMenuOpen = computed(() => openCount.value > 0)

export function onMenuOpenChange(open: boolean) {
  openCount.value += open ? 1 : -1
}

export function useTrackedMenuOpen(menuOpen: Ref<boolean>) {
  watch(menuOpen, onMenuOpenChange)
  onBeforeUnmount(() => {
    if (menuOpen.value) {
      onMenuOpenChange(false)
    }
  })
}
