<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700">
      <h3 class="text-sm font-semibold">Query Editor</h3>
      <div class="flex items-center gap-2">
        <div v-if="error" class="mr-2 text-xs text-red-500">
          {{ error }}
        </div>
        <button
          @click="handleExecute"
          :disabled="isLoading"
          class="flex items-center gap-2 px-3 py-1 text-sm text-white bg-blue-500 rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play class="w-3 h-3" />
          {{ isLoading ? 'Running...' : 'Run Query' }}
        </button>
      </div>
    </div>
    
    <div ref="editorContainer" class="flex-1"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { Play } from 'lucide-vue-next';
import { EditorView, minimalSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { useSelector } from '@xstate/vue';
import { id, type DatabaseState } from '../state';
import { applicationState } from '@/app'

const actor: DatabaseState = applicationState.system.get(id)
const currentQuery = useSelector(actor, (state) => state.context.currentQuery);
const isLoading = useSelector(actor, (state) => state.context.isLoading);
const error = useSelector(actor, (state) => state.context.error);
const editorContainer = ref<HTMLElement>();
let editorView: EditorView | null = null;

const createExtensions = () => [
  minimalSetup,
  history(),
  keymap.of([...defaultKeymap, ...historyKeymap]),
  javascript({ typescript: true }),
  oneDark,
  EditorView.theme({
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
    '.cm-line': {
      padding: '0 2px 0 6px',
    },
  }),
  EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      actor.send({
        type: 'QUERY.UPDATE',
        code: update.state.doc.toString()
      });
    }
  }),
];

onMounted(() => {
  if (!editorContainer.value) return;
  
  editorView = new EditorView({
    doc: currentQuery.value,
    extensions: createExtensions(),
    parent: editorContainer.value,
  });
});

onUnmounted(() => {
  editorView?.destroy();
});

// Watch for external changes to the query (from schema panel)
watch(currentQuery, (newQuery) => {
  if (editorView && editorView.state.doc.toString() !== newQuery) {
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: newQuery,
      },
    });
  }
});

function handleExecute() {
  if (!isLoading.value && editorView) {
    actor.send({
      type: 'QUERY.EXECUTE',
      code: editorView.state.doc.toString()
    });
  }
}
</script> 