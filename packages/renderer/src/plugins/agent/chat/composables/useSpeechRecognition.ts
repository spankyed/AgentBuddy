import { ref, onMounted, onUnmounted } from 'vue'

interface SpeechRecognitionOptions {
  lang?: string
  onResult?: (transcript: string) => void
  onError?: (error: string) => void
}

export function useSpeechRecognition(options: SpeechRecognitionOptions = {}) {
  const isSupported = ref(false)
  const isListening = ref(false)
  let removeListener: (() => void) | null = null

  const api = window.electronAPI?.speechRecognition

  onMounted(async () => {
    if (!api) return
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
            break
          case 'stopped':
            isListening.value = false
            break
          case 'error':
            options.onError?.(event.message || event.code || 'Unknown error')
            isListening.value = false
            break
        }
      })
    }
  })

  function toggle() {
    if (!api || !isSupported.value) return
    if (isListening.value) {
      api.stop()
    } else {
      api.start(options.lang || 'en-US')
    }
  }

  function stop() {
    if (api && isListening.value) {
      api.stop()
    }
  }

  onUnmounted(() => {
    stop()
    removeListener?.()
  })

  return { isSupported, isListening, toggle, stop }
}
