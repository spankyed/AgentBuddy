import { ref, onMounted, onUnmounted } from 'vue'
import type { Component } from 'vue'
import { useTrackedMenuOpen } from './useMenuState'

export interface MenuItem {
  label: string
  icon: Component
  class: string
  iconClass?: string
  action: () => void
  keepOpen?: boolean
}

export function useContextMenu() {
  const showMenu = ref(false)
  const menuRef = ref<HTMLDivElement | null>(null)
  const menuPos = ref({ x: 0, y: 0 })

  function open(e: MouseEvent, itemCount: number, extraHeight = 0) {
    const menuWidth = 160
    const menuHeight = itemCount * 36 + extraHeight
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8)
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 8)
    menuPos.value = { x, y }
    showMenu.value = true
  }

  function handleClickOutside(e: MouseEvent) {
    if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
      showMenu.value = false
    }
  }

  onMounted(() => document.addEventListener('mousedown', handleClickOutside))
  onUnmounted(() => document.removeEventListener('mousedown', handleClickOutside))

  useTrackedMenuOpen(showMenu)

  return { showMenu, menuRef, menuPos, open }
}
