# Issue: Phantom Selection on Double-Click Empty Lines

**Date:** 2026-04-09
**Status:** Open
**Severity:** Low — cosmetic annoyance
**Component:** Tiptap editor (all modes)

## Symptom

Double-clicking an empty line in the Tiptap editor creates a phantom selection — a visible highlight over nothing. This also triggers the bubble menu (formatting toolbar) to appear, even though there's no text to format.

A similar issue occurs when double-clicking at the very end of a line, where a phantom character appears selected instead of the last word.

## Root Cause Analysis

ProseMirror renders empty paragraphs as `<p><br class="ProseMirror-trailingBreak"></p>`. Double-clicking this creates a non-empty `TextSelection` over the invisible `<br>`. The bubble menu's `shouldShow` checks `selection.empty` which returns `false`, so the menu appears.

## Attempted Fixes (All Failed)

### 1. `handleDoubleClick` editorProps handler
Added to `TiptapEditor.vue`. Checked if `$pos.parent.isTextblock && $pos.parent.content.size === 0` and returned `true` to suppress default behavior.

**Why it failed:** ProseMirror's `posAtCoords()` for empty paragraphs appears to resolve the position outside the paragraph node (to the parent doc), so `$pos.parent` is the doc, not the empty paragraph. The check never matches.

### 2. CSS `::selection { background: transparent }` on `p.is-empty`
Extended the existing `p.is-editor-empty:first-child` rule to all `p.is-empty` elements.

**Why it failed:** Only hides the visual highlight. The ProseMirror selection state is unchanged, so the bubble menu still appears. CSS cannot prevent the selection from being created.

### 3. `appendTransaction` PhantomSelectionGuard extension
Created a ProseMirror plugin that collapses non-empty selections within empty textblocks back to a cursor via `appendTransaction`.

**Why it failed:** Needs further investigation. The `$from.sameParent($to)` check may not match because the selection boundaries for the phantom selection might span the paragraph node boundary (NodeSelection-like) rather than being a TextSelection within the paragraph.

## Key Files

- `packages/renderer/src/core/components/tiptap/TiptapEditor.vue` — editor setup, editorProps
- `packages/renderer/src/core/components/tiptap/TiptapBubbleMenu.vue` — `shouldShow` logic (line 45-49)
- `packages/renderer/src/core/components/tiptap/extensions.ts` — extension registry
- `packages/renderer/src/core/components/tiptap/tiptap-theme.css` — editor styles

## Possible Next Steps

- **Debug the actual selection state**: Add logging to capture `selection.constructor.name`, `selection.from`, `selection.to`, `selection.$from.parent.type.name`, and `selection.$to.parent.type.name` during the phantom selection to understand exactly what ProseMirror creates.
- **`handleDoubleClickOn`**: Try the `handleDoubleClickOn(view, pos, node, nodePos, event, direct)` editorProps handler which provides the actual clicked node, bypassing position resolution issues.
- **`handleDOMEvents.mousedown`**: Intercept at the raw DOM level using `event.detail === 2` to detect double-click, then check the target element for empty paragraph and call `event.preventDefault()`.
- **NodeSelection check**: The phantom selection might be a `NodeSelection` of the empty paragraph, not a `TextSelection`. The appendTransaction guard should check for `NodeSelection` instances too.
- **Bubble menu guard**: As a minimal workaround, add `doc.textBetween(from, to) === ''` check to `shouldShow` in `TiptapBubbleMenu.vue` to at least prevent the menu from appearing.
