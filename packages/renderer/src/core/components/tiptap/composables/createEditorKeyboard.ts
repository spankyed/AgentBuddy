import type { Editor } from '@tiptap/vue-3'
import type { EditorView } from '@tiptap/pm/view'
import { splitBlock } from '@tiptap/pm/commands'
import type { EditorConfig } from '../editor-config'
import { commandSuggestionPluginKey } from '../command-suggestion-plugin'
import { referenceSuggestionPluginKey } from '../reference-suggestion-plugin'

/** Returns true when ProseMirror's default Enter behavior should take over. */
function shouldDeferEnter(view: EditorView): boolean {
  const { $head } = view.state.selection

  if ($head.parent.type.name === 'codeBlock') return true

  // Defer when the paragraph text looks like a code block trigger (e.g. "```css" or "~~~python").
  // Without this, Enter is intercepted for submit/splitBlock before the Tiptap inputRulesPlugin
  // can run its handleKeyDown, which appends '\n' and matches the code block input rule regex
  // /^```([a-z]+)?[\s\n]$/ to convert the paragraph into a code block node.
  const text = $head.parent.textContent
  if (/^```([a-z]+)?$/.test(text) || /^~~~([a-z]+)?$/.test(text)) return true

  for (let d = $head.depth; d > 0; d--) {
    if ($head.node(d).type.name === 'listItem') return true
  }

  return false
}

interface KeyboardOptions {
  cfg: EditorConfig
  getEditor: () => Editor | undefined
  getInHistoryMode: () => boolean
  getPauseAvailable: () => boolean
  emit: {
    submit: () => void
    focusTitle: () => void
    historyPrev: () => void
    historyNext: () => void
    clearInput: () => void
    pause: () => void
  }
}

export function createKeyboardHandler({ cfg, getEditor, getInHistoryMode, getPauseAvailable, emit }: KeyboardOptions) {
  let lastEscTime = 0

  return (view: EditorView, event: KeyboardEvent) => {
    // ESC handling:
    //   1. popup active → let popup close (return false)
    //   2. pause available (streaming) → emit pause
    //   3. otherwise → double-tap to clear input
    if (event.key === 'Escape') {
      const cmdState = commandSuggestionPluginKey.getState(view.state)
      const refState = referenceSuggestionPluginKey.getState(view.state)
      if (cmdState?.active || refState?.active) {
        lastEscTime = 0
        return false
      }
      if (getPauseAvailable()) {
        lastEscTime = 0
        emit.pause()
        return true
      }
      const now = Date.now()
      if (now - lastEscTime < 300) {
        lastEscTime = 0
        emit.clearInput()
        return true
      }
      lastEscTime = now
      return false
    }

    // Trap Tab inside the editor. preventDefault blocks the browser's focus
    // shift; returning false lets ProseMirror's listKeymap still run
    // sinkListItem / liftListItem when the cursor is in a list item, and
    // swallows Tab harmlessly everywhere else (including orphaned list
    // items where sink/lift fails).
    if (event.key === 'Tab') {
      event.preventDefault()
      return false
    }

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
