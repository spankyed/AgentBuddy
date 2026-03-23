import { ref, watch, onMounted, onUnmounted } from 'vue'
import { onMenuOpenChange } from './useMenuState'

export function useContextMenu() {
  const showMenu = ref(false)
  const menuRef = ref<HTMLDivElement | null>(null)

  function handleClickOutside(e: MouseEvent) {
    if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
      showMenu.value = false
    }
  }

  onMounted(() => document.addEventListener('mousedown', handleClickOutside))
  onUnmounted(() => document.removeEventListener('mousedown', handleClickOutside))

  watch(showMenu, (val) => onMenuOpenChange(val))

  return { showMenu, menuRef }
}
