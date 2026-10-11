import type { Ref } from 'vue'

export function useInfiniteScroll(opts: {
  hasMore: Ref<boolean> | (() => boolean)
  loading: Ref<boolean> | (() => boolean)
  onLoadMore: () => void
  threshold?: number
}) {
  const onScroll = (e: Event) => {
    const el = e.target as HTMLElement
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - (opts.threshold ?? 100)) {
      const more = typeof opts.hasMore === 'function' ? opts.hasMore() : opts.hasMore.value
      const busy = typeof opts.loading === 'function' ? opts.loading() : opts.loading.value
      if (more && !busy) opts.onLoadMore()
    }
  }
  return { onScroll }
}
