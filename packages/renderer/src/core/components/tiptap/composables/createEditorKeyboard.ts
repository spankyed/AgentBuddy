import type { Editor } from '@tiptap/vue-3'
import type { EditorView } from '@tiptap/pm/view'
import { splitBlock } from '@tiptap/pm/commands'
import type { EditorConfig } from '../editor-config'
import { commandSuggestionPluginKey } from '../command-suggestion-plugin'
import { referenceSuggestionPluginKey } from '../reference-suggestion-plugin'

/** Max interval (ms) between two ESC presses to count as a double-tap. */
export const DOUBLE_ESC_MS = 300

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
    const name = $head.node(d).type.name
    if (name === 'listItem' || name === 'blockquote') return true
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
    /** Optional — only wired up by consumers (like chat input) that want
     * double-ESC on an empty editor to open a revert-history menu
     * instead of being a no-op clear. */
    openRevertMenu?: () => void
  }
}

export function createKeyboardHandler({ cfg, getEditor, getInHistoryMode, getPauseAvailable, emit }: KeyboardOptions) {
  // Per-handler-instance state for ESC double-tap. Do NOT lift this out
  // of the closure — multiple TiptapEditors must not share this.
  let lastEscTime = 0

  return (view: EditorView, event: KeyboardEvent) => {
    // Skip shortcuts during IME composition so Tab/Enter mid-Pinyin etc.
    // don't hijack composition commit.
    if (event.isComposing) return false

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
      if (now - lastEscTime < DOUBLE_ESC_MS) {
        lastEscTime = 0
        // In the chat input, double-ESC on an already-empty editor opens
        // the revert-history menu. Elsewhere (and when there's text to
        // discard), the original clear-input behavior runs.
        const isEmpty = !view.state.doc.textContent.trim()
        if (isEmpty && emit.openRevertMenu) {
          emit.openRevertMenu()
        } else {
          emit.clearInput()
        }
        return true
      }
      lastEscTime = now
      return false
    }

    // Trap Tab inside editable editors. preventDefault blocks the browser's
    // focus shift; returning false lets ProseMirror's listKeymap still run
    // sinkListItem / liftListItem when the cursor is in a list item, and
    // swallows Tab harmlessly everywhere else (including orphaned list
    // items where sink/lift fails). In viewer mode we let Tab pass through
    // so keyboard-only users can move focus past read-only content.
    if (event.key === 'Tab') {
      if (!cfg.editable) return false
      if (event.shiftKey) {
        if (cfg.enterSubmit) return true // chat input: bubble to form for cyclePhase
        event.preventDefault()
        return false // editor: let ProseMirror handle liftListItem
      }
      event.preventDefault()
      return false
    }

    // ⌘+Shift+V → paste as plain text, parsed as markdown for structure
    if (event.key === 'v' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      const editor = getEditor()
      if (!editor) return true
      navigator.clipboard.readText()
        .then(text => {
          // Drop the read if the editor has been torn down or replaced
          // between keypress and resolution (prevents out-of-order inserts
          // when the user pastes rapidly across entity switches).
          if (!text || getEditor() !== editor) return
          editor.commands.insertContent(text)
        })
        .catch(() => { /* clipboard permission denied — silent */ })
      return true
    }

    if (cfg.historyNavigation) {
      const isEmpty = view.state.doc.content.size <= 2

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
