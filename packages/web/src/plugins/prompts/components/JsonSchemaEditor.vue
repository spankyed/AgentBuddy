<template>
  <div class="space-y-2">
    <div class="relative">
      <div 
        ref="editorContainer" 
        class="overflow-hidden border rounded-md border-neutral-700"
        :class="{ '!border-red-500': hasError }"
        style="height: 250px"
      ></div>
      <div v-if="hasError || (value && !hasError)" class="absolute top-2 right-2 z-10">
        <span 
          class="inline-flex items-center px-2 py-1 text-xs font-medium rounded"
          :class="hasError ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'"
        >
          {{ hasError ? 'Invalid JSON' : 'Valid JSON' }}
        </span>
      </div>
    </div>
    <p class="text-xs text-neutral-500">
      Define a JSON schema for structured output. Example: <code class="px-1 py-0.5 rounded bg-neutral-800 text-neutral-400">{{ '{ "type": "object", "properties": { ... } }' }}</code>
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { EditorView, basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorState } from '@codemirror/state';

const props = defineProps<{
  value: any;
}>();

const emit = defineEmits<{
  update: [value: any];
}>();

const editorContainer = ref<HTMLElement>();
const hasError = ref(false);
let editorView: EditorView | null = null;

// Validate JSON on changes
const validateJson = (doc: string) => {
  if (!doc.trim()) {
    hasError.value = false;
    return true;
  }
  
  try {
    JSON.parse(doc);
    hasError.value = false;
    return true;
  } catch (e) {
    hasError.value = true;
    return false;
  }
};

const createEditorTheme = () => EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
  },
  '.cm-content': {
    padding: '12px',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  },
  '.cm-focused .cm-cursor': {
    borderLeftColor: '#3b82f6',
  },
  '.cm-gutters': {
    backgroundColor: '#171717',
    color: '#737373',
    border: 'none',
  },
  '.cm-lineNumbers': {
    minWidth: '40px',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#262626',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'rgba(59, 130, 246, 0.3) !important',
  },
  '.cm-diagnostic-error': {
    borderLeft: '3px solid #ef4444',
    paddingLeft: '8px',
    marginLeft: '-11px',
  }
});

const createExtensions = () => [
  basicSetup,
  keymap.of([indentWithTab]),
  javascript({ typescript: false }),
  oneDark,
  createEditorTheme(),
  EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const doc = update.state.doc.toString();
      validateJson(doc);
      if (!doc.trim()) {
        emit('update', undefined);
      } else {
        try {
          const parsed = JSON.parse(doc);
          emit('update', parsed);
        } catch {
          // Don't emit if invalid
        }
      }
    }
  }),
  EditorView.lineWrapping,
];

onMounted(() => {
  if (!editorContainer.value) return;
  
  let initialDoc = '';
  if (props.value) {
    try {
      initialDoc = JSON.stringify(props.value, null, 2);
    } catch {
      initialDoc = '';
    }
  }
  
  editorView = new EditorView({
    state: EditorState.create({
      doc: initialDoc,
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
  if (!editorView) return;
  
  let newDoc = '';
  if (newValue) {
    try {
      newDoc = JSON.stringify(newValue, null, 2);
    } catch {
      newDoc = '';
    }
  }
  
  if (editorView.state.doc.toString() !== newDoc) {
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: newDoc,
      },
    });
  }
});
</script> 