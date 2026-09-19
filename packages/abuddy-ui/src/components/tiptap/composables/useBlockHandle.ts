import { ref } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import { NodeSelection } from '@tiptap/pm/state'

export function useBlockHandle(getEditor: () => Editor) {
  const buttonVisible = ref(false)
  const buttonTop = ref(0)
  const hoveredBlockEl = ref<HTMLElement | null>(null)
  const dropIndicatorTop = ref<number | null>(null)
  let dragState: { pos: number; node: any } | null = null
  // `mouseup` fires on the actual release target regardless of where the
  // gesture started. Gate the drag-handle mouseup on a matching mousedown
  // so stray releases over the handle don't trigger focus() (which would
  // scroll the selection into view).
  let dragHandlePressed = false

  function getBlockNodeAt(blockEl: HTMLElement) {
    const editor = getEditor()
    const pos = editor.view.posAtDOM(blockEl, 0)
    const $pos = editor.state.doc.resolve(pos)
    const topPos = $pos.before(1)
    return { pos: topPos, node: editor.state.doc.nodeAt(topPos)! }
  }

  function walkToDirectChild(node: HTMLElement | null, parent: HTMLElement): HTMLElement | null {
    while (node && node.parentElement !== parent) node = node.parentElement
    return node?.parentElement === parent ? node : null
  }

  function resolveBlock(node: Node, editorDom: HTMLElement): HTMLElement | null {
    const el = (node.nodeType === Node.TEXT_NODE ? node.parentElement : node) as HTMLElement
    return walkToDirectChild(el, editorDom)
  }

  function updateButtonPosition(block: HTMLElement) {
    const wrapper = (getEditor().view.dom as HTMLElement).closest('.tiptap-editor') as HTMLElement
    if (wrapper) {
      buttonTop.value = block.getBoundingClientRect().top - wrapper.getBoundingClientRect().top
    }
  }

  function findBlockFromGutter(editorDom: HTMLElement, event: MouseEvent): HTMLElement | null {
    const editor = getEditor()
    const rect = editorDom.getBoundingClientRect()
    const contentX = rect.left + (parseFloat(getComputedStyle(editorDom).paddingLeft) || 0) + 4
    const pos = editor.view.posAtCoords({ left: contentX, top: event.clientY })
    if (pos) {
      const block = resolveBlock(editor.view.domAtPos(pos.pos).node, editorDom)
      if (block) return block
    }
    // Fallback for atom nodes (e.g. subdocument links): find nearest child by vertical position
    let closest: HTMLElement | null = null
    let closestDist = Infinity
    for (const child of editorDom.children) {
      const r = child.getBoundingClientRect()
      if (event.clientY >= r.top && event.clientY <= r.bottom) return child as HTMLElement
      const dist = Math.min(Math.abs(event.clientY - r.top), Math.abs(event.clientY - r.bottom))
      if (dist < closestDist) { closestDist = dist; closest = child as HTMLElement }
    }
    return closest
  }

  // Drag handle
  function onDragHandleMouseDown() {
    dragHandlePressed = true
    if (!hoveredBlockEl.value) return
    const editor = getEditor()
    const { pos } = getBlockNodeAt(hoveredBlockEl.value)
    try {
      const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos))
      editor.view.dispatch(tr)
    } catch { /* node type doesn't support NodeSelection */ }
  }

  function onDragHandleMouseUp() {
    if (!dragHandlePressed) return
    dragHandlePressed = false
    getEditor().view.focus()
  }

  function onDragStart(event: DragEvent) {
    if (!hoveredBlockEl.value || !event.dataTransfer) return
    dragState = getBlockNodeAt(hoveredBlockEl.value)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-block-drag', '')
    event.dataTransfer.setDragImage(hoveredBlockEl.value, 0, 0)
  }

  function onDragEnd() {
    dropIndicatorTop.value = null
    dragState = null
    dragHandlePressed = false
  }

  function getDropBoundary(clientY: number): { indicatorY: number; insertPos: number } {
    const editor = getEditor()
    const editorDom = editor.view.dom as HTMLElement
    const wrapper = editorDom.closest('.tiptap-editor') as HTMLElement
    const wrapperTop = wrapper?.getBoundingClientRect().top ?? 0
    const children = Array.from(editorDom.children) as HTMLElement[]

    for (const child of children) {
      const r = child.getBoundingClientRect()
      if (clientY < (r.top + r.bottom) / 2) {
        const pos = editor.view.posAtDOM(child, 0)
        const insertPos = editor.state.doc.resolve(pos).before(1)
        return { indicatorY: r.top - wrapperTop, insertPos }
      }
    }
    return { indicatorY: (children.at(-1)?.getBoundingClientRect().bottom ?? 0) - wrapperTop, insertPos: editor.state.doc.content.size }
  }

  function onEditorDragOver(event: DragEvent) {
    if (!dragState) return
    event.preventDefault()
    event.stopPropagation()
    dropIndicatorTop.value = getDropBoundary(event.clientY).indicatorY
  }

  function onEditorDrop(event: DragEvent) {
    if (!dragState) return
    event.preventDefault()
    event.stopPropagation()

    const editor = getEditor()
    const { pos: sourcePos, node } = dragState
    const { insertPos } = getDropBoundary(event.clientY)

    let tr = editor.state.tr.delete(sourcePos, sourcePos + node.nodeSize)
    const mapped = Math.min(tr.mapping.map(insertPos), tr.doc.content.size)
    tr = tr.insert(mapped, node)
    editor.view.dispatch(tr)

    dropIndicatorTop.value = null
    dragState = null
  }

  // Hover tracking
  function onEditorMouseMove(event: MouseEvent) {
    const editorDom = getEditor().view.dom as HTMLElement
    const block = walkToDirectChild(event.target as HTMLElement, editorDom) ?? findBlockFromGutter(editorDom, event)

    if (!block) {
      buttonVisible.value = false
      return
    }

    hoveredBlockEl.value = block
    buttonVisible.value = true
    updateButtonPosition(block)
  }

  // Lifecycle
  function mount(isOpen: () => boolean) {
    const editorDom = getEditor().view.dom as HTMLElement
    const wrappedMouseMove = (event: MouseEvent) => {
      if (isOpen()) return
      if (!getEditor().state.selection.empty) return
      onEditorMouseMove(event)
    }
    const wrappedMouseLeave = () => {
      if (!isOpen()) buttonVisible.value = false
    }

    editorDom.addEventListener('mousemove', wrappedMouseMove)
    editorDom.addEventListener('mouseleave', wrappedMouseLeave)
    document.addEventListener('dragover', onEditorDragOver, true)
    document.addEventListener('drop', onEditorDrop, true)

    return () => {
      document.removeEventListener('dragover', onEditorDragOver, true)
      document.removeEventListener('drop', onEditorDrop, true)
      if (getEditor().isDestroyed) return
      editorDom.removeEventListener('mousemove', wrappedMouseMove)
      editorDom.removeEventListener('mouseleave', wrappedMouseLeave)
    }
  }

  return {
    buttonVisible,
    buttonTop,
    hoveredBlockEl,
    dropIndicatorTop,
    resolveBlock,
    updateButtonPosition,
    onDragHandleMouseDown,
    onDragHandleMouseUp,
    onDragStart,
    onDragEnd,
    mount,
  }
}
