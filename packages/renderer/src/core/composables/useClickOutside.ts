import { onMounted, onUnmounted, type Ref } from 'vue'

export function useClickOutside(
  elementRef: Ref<HTMLElement | null | undefined>,
  callback: () => void
) {
  const handleClickOutside = (e: MouseEvent) => {
    if (elementRef.value && !elementRef.value.contains(e.target as Node)) {
      callback()
    }
  }

  onMounted(() => {
    document.addEventListener('click', handleClickOutside)
  })

  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
  })
}
