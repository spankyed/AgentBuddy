<template>
  <div ref="editorContainer" class="h-full"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { EditorView, minimalSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { createEditorTheme } from './editor-theme';

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  execute: [];
  cursorChange: [position: { line: number; col: number }];
}>();

const editorContainer = ref<HTMLElement>();
let editorView: EditorView | null = null;

const createExtensions = () => [
  minimalSetup,
  history(),
  keymap.of([
    ...defaultKeymap, 
    ...historyKeymap,
    {
      key: 'Mod-Enter',
      run: () => {
        emit('execute');
        return true;
      }
    }
  ]),
  javascript({ typescript: true }),
  oneDark,
  createEditorTheme(),
  EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      emit('update:modelValue', update.state.doc.toString());
    }
    
    // Update cursor position
    const main = update.state.selection.main;
    const line = update.state.doc.lineAt(main.head);
    emit('cursorChange', {
      line: line.number,
      col: main.head - line.from + 1
    });
  }),
];

onMounted(() => {
  if (!editorContainer.value) return;
  
  editorView = new EditorView({
    doc: props.modelValue,
    extensions: createExtensions(),
    parent: editorContainer.value,
  });
});

onUnmounted(() => {
  editorView?.destroy();
});

// Watch for external changes
watch(() => props.modelValue, (newValue) => {
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