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
import { EditorState } from '@codemirror/state';

const props = defineProps<{
  value: string;
}>();

const emit = defineEmits<{
  update: [value: string];
}>();

const editorContainer = ref<HTMLElement>();
let editorView: EditorView | null = null;

const placeholder = `// Example action function
const { param1, param2 } = params;

// Use available services
await services.logger.info('Starting action', { param1, param2 });

try {
  // Your action logic here
  const result = await services.database.query(
    'SELECT * FROM users WHERE id = ?',
    [param1]
  );
  
  // Send email notification
  await services.email.send(
    param2,
    'Action completed',
    'Your action has been processed successfully.'
  );
  
  return {
    success: true,
    data: result.rows
  };
} catch (error) {
  await services.logger.error('Action failed', error);
  throw error;
}`;

const createEditorTheme = () => EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '14px',
  },
  '.cm-content': {
    padding: '12px',
  },
  '.cm-focused .cm-cursor': {
    borderLeftColor: '#528bff',
  },
  '.cm-gutters': {
    backgroundColor: '#1e1e1e',
    color: '#858585',
    border: 'none',
  },
  '.cm-lineNumbers': {
    minWidth: '40px',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#2a2a2a',
  },
});

const createExtensions = () => [
  minimalSetup,
  history(),
  keymap.of([
    ...defaultKeymap, 
    ...historyKeymap,
  ]),
  javascript({ typescript: false }),
  oneDark,
  createEditorTheme(),
  EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      emit('update', update.state.doc.toString());
    }
  }),
  EditorView.lineWrapping,
];

onMounted(() => {
  if (!editorContainer.value) return;
  
  const initialValue = props.value || placeholder;
  
  editorView = new EditorView({
    state: EditorState.create({
      doc: initialValue,
      extensions: createExtensions(),
    }),
    parent: editorContainer.value,
  });
});

onUnmounted(() => {
  editorView?.destroy();
});

// Watch for external changes
watch(() => props.value, (newValue) => {
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