<template>
  <div class="p-4">
    <div ref="editorContainer" class="rounded-md overflow-hidden border border-neutral-800"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';

interface Props {
  data: any;
}

const props = defineProps<Props>();
const editorContainer = ref<HTMLDivElement>();
let editorView: EditorView | null = null;

const formattedJson = computed(() => {
  return JSON.stringify(props.data, null, 2);
});

const extensions = [
  basicSetup,
  javascript({ typescript: false }),
  oneDark,
  EditorView.editable.of(false),
  EditorState.readOnly.of(true),
  EditorView.theme({
    '&': {
      fontSize: '14px',
      height: '100%',
      minHeight: '200px',
      maxHeight: '600px'
    },
    '.cm-content': {
      padding: '16px',
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'
    },
    '.cm-editor': {
      height: '100%'
    },
    '.cm-scroller': {
      fontFamily: 'inherit',
      overflow: 'auto'
    },
    '.cm-focused': {
      outline: 'none'
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: '#3B82F6'
    },
    '.cm-line': {
      padding: '0'
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      borderRight: '1px solid #404040'
    },
    '.cm-lineNumbers .cm-gutterElement': {
      color: '#8B8B8B',
      padding: '0 16px 0 8px'
    }
  }),
  EditorView.lineWrapping
];

onMounted(() => {
  if (editorContainer.value) {
    const state = EditorState.create({
      doc: formattedJson.value,
      extensions
    });

    editorView = new EditorView({
      state,
      parent: editorContainer.value
    });
  }
});

onUnmounted(() => {
  editorView?.destroy();
});

watch(formattedJson, (newValue) => {
  if (editorView) {
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: newValue
      }
    });
  }
});
</script> 