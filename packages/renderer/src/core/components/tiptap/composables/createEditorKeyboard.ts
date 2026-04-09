import type { Editor } from '@tiptap/vue-3'
import type { EditorView } from '@tiptap/pm/view'
import { splitBlock } from '@tiptap/pm/commands'
import type { EditorConfig } from '../editor-config'

/** Returns true when ProseMirror's default Enter behavior should take over. */
function shouldDeferEnter(view: EditorView): boolean {
  const { $head } = view.state.selection

  if ($head.parent.type.name === 'codeBlock') return true

  for (let d = $head.depth; d > 0; d--) {
    if ($head.node(d).type.name === 'listItem') return true
  }

  return false
}

interface KeyboardOptions {
  cfg: EditorConfig
  getEditor: () => Editor | undefined
  getInHistoryMode: () => boolean
  emit: {
    submit: () => void
    focusTitle: () => void
    historyPrev: () => void
    historyNext: () => void
  }
}

export function createKeyboardHandler({ cfg, getEditor, getInHistoryMode, emit }: KeyboardOptions) {
  return (view: EditorView, event: KeyboardEvent) => {
    // ⌘+Shift+V → paste as plain text, parsed as markdown for structure
    if (event.key === 'v' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      const editor = getEditor()
      navigator.clipboard.readText().then(text => {
        if (!text || !editor) return
        editor.commands.insertContent(text)
      })
      return true
    }

    if (cfg.historyNavigation) {
      const isEmpty = !view.state.doc.textContent.trim()

      if (event.key === 'ArrowUp' && (isEmpty || getInHistoryMode())) {
        emit.historyPrev()
        return true
      }
      if (event.key === 'ArrowDown' && (isEmpty || getInHistoryMode())) {
        emit.historyNext()
        return true
      }
    }

    // ⌘/Ctrl+X on empty selection → select entire line block, let ProseMirror cut it
    if (event.key === 'x' && (event.metaKey || event.ctrlKey) && view.state.selection.empty) {
      const { $from } = view.state.selection

      // Walk up past single-child wrappers so the whole block is cut (e.g. listItem, blockquote)
      let depth = $from.depth
      while (depth > 1 && $from.node(depth - 1).childCount === 1) depth--

      // Select the full block and let ProseMirror + tiptap-markdown handle cut + clipboard
      getEditor()?.commands.setTextSelection({ from: $from.before(depth), to: $from.after(depth) })
      return false
    }

    if ((event.key === 'ArrowUp' || event.key === 'ArrowLeft') && view.state.selection.from <= 1) {
      emit.focusTitle()
      return true
    }

    if (cfg.enterSubmit && event.key === 'Enter') {
      if (shouldDeferEnter(view)) return false

      if (event.shiftKey) {
        return splitBlock(view.state, view.dispatch)
      }

      emit.submit()
      return true
    }

    return false
  }
}
