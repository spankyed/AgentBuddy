// The editor's props and emits, named once: `TiptapEditor.vue` declares them as its public contract, and the
// instance component it rebuilds takes the same values. Under `internal/`, which `isPublicModule`
// (`scripts/exports.ts`) keeps out of the exports map — this is one component's shape, not a module a pack
// imports.
import type { TiptapMode, TiptapVariant } from '../extensions.ts'

export interface TiptapEditorProps {
  mode: TiptapMode
  variant?: TiptapVariant
  modelValue?: string
  placeholder?: string
  disabled?: boolean
  editorClass?: string
  entityId?: string
  disableImages?: boolean
  showGutter?: boolean
  inHistoryMode?: boolean
  pauseAvailable?: boolean
  /** Override navigation for links in the Markdown viewer. */
  openViewerLink?: (href: string) => void
}

/** The two props with no default, so they are the two that stay optional once the wrapper has resolved them */
type Undefaulted = 'entityId' | 'openViewerLink'

/**
 * The props as the wrapper hands them on: every defaulted field present, because `v-bind="props"` passes the
 * resolved reactive object. Derived rather than written out, so the defaults live in exactly one place —
 * `withDefaults` in the wrapper — and adding a prop there cannot leave a second list behind.
 */
export type ResolvedTiptapEditorProps =
  Required<Omit<TiptapEditorProps, Undefaulted>> & Pick<TiptapEditorProps, Undefaulted>

export interface TiptapEditorEmit {
  (e: 'update:modelValue', value: string): void
  (e: 'submit'): void
  (e: 'noteLinkClick', noteId: string): void
  (e: 'subDocumentLinkDeleted', noteId: string): void
  (e: 'subDocumentLinkRestored', noteId: string): void
  (e: 'focusTitle'): void
  (e: 'history-prev'): void
  (e: 'history-next'): void
  (e: 'clearInput'): void
  (e: 'pause'): void
  (e: 'open-revert-menu'): void
  (e: 'imageClick', src: string): void
}
