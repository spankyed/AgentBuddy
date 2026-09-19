import { ref } from 'vue'

interface UseExternalFileDragOptions {
  /** Optional guard on dragenter — return false to ignore. Default: accept all file drags. */
  accept?: (dt: DataTransfer) => boolean
  /** Called on drop. Only fires if an external file drag was active. */
  onDrop?: (e: DragEvent) => void
}

export function useExternalFileDrag(options: UseExternalFileDragOptions = {}) {
  const isDragging = ref(false)
  let counter = 0

  const onDragEnter = (e: DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return
    if (options.accept && !options.accept(e.dataTransfer)) return
    counter++
    if (counter === 1) isDragging.value = true
  }

  const onDragLeave = () => {
    counter--
    if (counter <= 0) { counter = 0; isDragging.value = false }
  }

  const onDrop = (e: DragEvent) => {
    const wasActive = isDragging.value
    counter = 0
    isDragging.value = false
    if (wasActive && options.onDrop) options.onDrop(e)
  }

  return { isDragging, onDragEnter, onDragLeave, onDrop }
}
