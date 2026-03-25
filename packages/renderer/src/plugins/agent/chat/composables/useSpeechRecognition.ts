import { ref, onUnmounted } from 'vue'

interface SpeechRecognitionOptions {
  lang?: string
  onResult?: (transcript: string) => void
  onError?: (error: string) => void
}

export function useSpeechRecognition(options: SpeechRecognitionOptions = {}) {
  const SpeechRecognitionCtor =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

  const isSupported = !!SpeechRecognitionCtor
  const isListening = ref(false)

  let recognition: any = null

  if (isSupported) {
    recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = options.lang || 'en-US'

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          options.onResult?.(event.results[i][0].transcript)
        }
      }
    }

    recognition.onerror = (event: any) => {
      options.onError?.(event.error)
      isListening.value = false
    }

    recognition.onend = () => {
      isListening.value = false
    }
  }

  function toggle() {
    if (!recognition) return
    if (isListening.value) {
      recognition.stop()
    } else {
      recognition.start()
      isListening.value = true
    }
  }

  function stop() {
    if (recognition && isListening.value) {
      recognition.stop()
    }
  }

  onUnmounted(() => {
    stop()
  })

  return { isSupported, isListening, toggle, stop }
}
