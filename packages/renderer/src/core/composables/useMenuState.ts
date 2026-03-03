import { ref, computed } from 'vue'

const openCount = ref(0)

export const isAnyMenuOpen = computed(() => openCount.value > 0)

export function onMenuOpenChange(open: boolean) {
  openCount.value += open ? 1 : -1
}
