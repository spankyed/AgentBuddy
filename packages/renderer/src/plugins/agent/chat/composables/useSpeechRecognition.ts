import { ref, onUnmounted } from 'vue'
import { trpc } from '@/core/trpc'

interface SpeechRecognitionOptions {
  onResult?: (transcript: string) => void
  onError?: (error: string) => void
}

export function useSpeechRecognition(options: SpeechRecognitionOptions = {}) {
  const isSupported = !!navigator.mediaDevices?.getUserMedia
  const isListening = ref(false)
  const isTranscribing = ref(false)

  let mediaRecorder: MediaRecorder | null = null
  let audioChunks: Blob[] = []
  let stream: MediaStream | null = null
  let busUnsubscribe: (() => void) | null = null

  // Subscribe to backend transcription events
  function setupBusSubscription() {
    if (busUnsubscribe) return

    const subscription = trpc.bus.sub.subscribe(undefined, {
      onData: (event: any) => {
        if (event.type === 'TRANSCRIPTION_RESULT' && event.pluginId === 'transcription') {
          isTranscribing.value = false
          options.onResult?.(event.text)
        } else if (event.type === 'TRANSCRIPTION_ERROR' && event.pluginId === 'transcription') {
          isTranscribing.value = false
          options.onError?.(event.error)
        }
      },
      onError: (error: any) => {
        console.error('Transcription subscription error:', error)
      },
    })

    busUnsubscribe = () => subscription.unsubscribe()
  }

  async function startRecording() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunks = []

      mediaRecorder = new MediaRecorder(stream)

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Release mic
        stream?.getTracks().forEach(track => track.stop())
        stream = null

        if (audioChunks.length === 0) return

        const mimeType = mediaRecorder?.mimeType || 'audio/webm'
        const audioBlob = new Blob(audioChunks, { type: mimeType })
        audioChunks = []

        // Convert to base64
        const arrayBuffer = await audioBlob.arrayBuffer()
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        )

        isTranscribing.value = true

        // Send to backend transcription system
        trpc.bus.send.mutate({
          systemId: 'transcription',
          type: 'TRANSCRIBE',
          audio: base64,
          mimeType,
        } as any)
      }

      setupBusSubscription()
      mediaRecorder.start()
      isListening.value = true
    } catch (err: any) {
      options.onError?.(err.message || 'Failed to access microphone')
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    isListening.value = false
  }

  function toggle() {
    if (isListening.value) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  function stop() {
    stopRecording()
  }

  onUnmounted(() => {
    stop()
    stream?.getTracks().forEach(track => track.stop())
    busUnsubscribe?.()
  })

  return { isSupported, isListening, isTranscribing, toggle, stop }
}
