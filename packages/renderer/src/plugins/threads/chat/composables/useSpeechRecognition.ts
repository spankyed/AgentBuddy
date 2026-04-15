import { ref, onMounted, onUnmounted } from 'vue'

interface SpeechRecognitionOptions {
  lang?: string
  onResult?: (transcript: string) => void
  onError?: (error: string) => void
}

export function useSpeechRecognition(options: SpeechRecognitionOptions = {}) {
  const isSupported = ref(false)
  const isListening = ref(false)
  const pending = ref(false)
  let removeListener: (() => void) | null = null

  const api = window.electronAPI?.speechRecognition

  function handleError(err: unknown, fallback: string) {
    isListening.value = false
    options.onError?.(err instanceof Error ? err.message : fallback)
  }

  onMounted(async () => {
    if (!api) return
    try {
      const result = await api.isAvailable()
      isSupported.value = result.available

      if (result.available) {
        removeListener = api.onEvent((event) => {
          switch (event.event) {
            case 'final':
              if (event.text) options.onResult?.(event.text)
              break
            case 'started':
              isListening.value = true
              pending.value = false
              break
            case 'stopped':
              isListening.value = false
              pending.value = false
              break
            case 'error':
              options.onError?.(event.message || event.code || 'Unknown error')
              isListening.value = false
              pending.value = false
              break
            case 'ready':
            case 'partial':
              break
            default: {
              const _exhaustive: never = event
              break
            }
          }
        })
      }
    } catch (err) {
      handleError(err, 'Speech recognition unavailable')
    }
  })

  async function toggle() {
    if (!api || !isSupported.value) return
    try {
      if (isListening.value) {
        await api.stop()
      } else {
        pending.value = true
        await api.start(options.lang || 'en-US')
      }
    } catch (err) {
      pending.value = false
      handleError(err, 'Speech recognition error')
    }
  }

  async function start() {
    if (!api || !isSupported.value || isListening.value || pending.value) return
    try {
      pending.value = true
      await api.start(options.lang || 'en-US')
    } catch (err) {
      pending.value = false
      handleError(err, 'Speech recognition error')
    }
  }

  async function stop() {
    if (!api || !isListening.value) return
    try {
      await api.stop()
    } catch (err) {
      handleError(err, 'Failed to stop speech recognition')
    }
  }

  onUnmounted(() => {
    if (api && (isListening.value || pending.value)) {
      api.stop().catch(() => {})
    }
    removeListener?.()
  })

  return { isSupported, isListening, toggle, start, stop }
}
