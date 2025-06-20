import { EditorView } from '@codemirror/view';

export function createEditorTheme() {
  return EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '14px',
      backgroundColor: '#171717',
    },
    '.cm-editor': {
      backgroundColor: '#171717',
      height: '100%',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
      backgroundColor: '#171717',
      /* Firefox scrollbar */
      scrollbarWidth: 'thin',
      scrollbarColor: 'rgba(155, 155, 155, 0.3) transparent',
    },
    '.cm-content': {
      padding: '16px',
      minHeight: '100%',
    },
    '.cm-focused .cm-cursor': {
      borderLeftColor: '#3B82F6',
    },
    '.cm-line': {
      padding: '0 2px 0 6px',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
    },
    '&.cm-editor.cm-focused': {
      outline: 'none',
    },
    /* Scrollbar styling */
    '.cm-scroller::-webkit-scrollbar': {
      width: '12px',
      height: '12px',
    },
    '.cm-scroller::-webkit-scrollbar-track': {
      backgroundColor: 'transparent',
    },
    '.cm-scroller::-webkit-scrollbar-thumb': {
      backgroundColor: 'rgba(155, 155, 155, 0.3)',
      borderRadius: '6px',
      border: '3px solid transparent',
      backgroundClip: 'content-box',
    },
    '.cm-scroller::-webkit-scrollbar-thumb:hover': {
      backgroundColor: 'rgba(155, 155, 155, 0.5)',
    },
    '.cm-scroller::-webkit-scrollbar-corner': {
      backgroundColor: 'transparent',
    },

  });
} 