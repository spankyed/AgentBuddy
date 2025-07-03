<template>
  <div ref="editorContainer" class="h-full"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { EditorView, minimalSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorState } from '@codemirror/state';

const props = defineProps<{
  code: string;
}>();

const editorContainer = ref<HTMLElement>();
let editorView: EditorView | null = null;

const createEditorTheme = () => EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '14px',
  },
  '.cm-content': {
    padding: '12px',
  },
  '.cm-gutters': {
    backgroundColor: '#1e1e1e',
    color: '#858585',
    border: 'none',
  },
  '.cm-lineNumbers': {
    minWidth: '40px',
  },
});

const createExtensions = () => [
  minimalSetup,
  javascript({ typescript: false }),
  oneDark,
  createEditorTheme(),
  EditorView.editable.of(false),
  EditorState.readOnly.of(true),
  EditorView.lineWrapping,
];

onMounted(() => {
  if (!editorContainer.value) return;
  
  editorView = new EditorView({
    state: EditorState.create({
      doc: props.code,
      extensions: createExtensions(),
    }),
    parent: editorContainer.value,
  });
});

onUnmounted(() => {
  editorView?.destroy();
});

// Watch for external changes
watch(() => props.code, (newValue) => {
  if (editorView && editorView.state.doc.toString() !== newValue) {
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: newValue,
      },
    });
  }
});
</script>