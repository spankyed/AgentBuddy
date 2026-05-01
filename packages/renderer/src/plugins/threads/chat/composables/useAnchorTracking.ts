import { ref, onMounted, onBeforeUnmount, watch, type MaybeRefOrGetter, toValue } from 'vue'

/**
 * Shared rAF position-tracking + IntersectionObserver visibility gate
 * for elements teleported to <body> that must stay anchored to a DOM node
 * inside an overflow:hidden container.
 */
export function useAnchorTracking(
  anchor: MaybeRefOrGetter<HTMLElement | null | undefined>,
  updatePos: (el: HTMLElement) => void,
  clearPos: () => void,
) {
  const isVisible = ref(false)

  // rAF loop
  let rafId: number | null = null
  function tick() {
    const el = toValue(anchor)
    if (el) updatePos(el)
    else clearPos()
    rafId = requestAnimationFrame(tick)
  }

  // IntersectionObserver — hides the teleported element when the anchor is
  // clipped by any overflow:hidden ancestor (e.g. chat panel collapsed).
  let io: IntersectionObserver | null = null
  function observe(el: HTMLElement | null | undefined) {
    io?.disconnect()
    io = null
    isVisible.value = false
    if (!el) return
    io = new IntersectionObserver(
      ([entry]) => { isVisible.value = entry.isIntersecting },
      { threshold: 0 },
    )
    io.observe(el)
  }

  watch(() => toValue(anchor), (el) => observe(el ?? null), { immediate: true })

  onMounted(() => { tick() })
  onBeforeUnmount(() => {
    io?.disconnect()
    if (rafId != null) cancelAnimationFrame(rafId)
  })

  return { isVisible }
}
