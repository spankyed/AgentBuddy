<template>
  <div class="flex flex-col h-full border-r border-gray-200 dark:border-gray-700">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
      <div class="flex items-center gap-4">
        <!-- Mode Tabs -->
        <div class="flex items-center gap-1 p-1 bg-gray-100 rounded-lg dark:bg-gray-800">
          <button
            v-for="mode in ['query', 'examples']"
            :key="mode"
            @click="activeMode = (mode as 'query' | 'examples')"
            :class="[
              'px-3 py-1 text-xs font-medium rounded transition-all',
              activeMode === mode
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            ]"
          >
            {{ mode === 'query' ? 'Query' : 'Examples' }}
          </button>
        </div>
      </div>
      
      <!-- Actions -->
      <div class="flex items-center gap-2">
        <!-- Keyboard shortcuts hint -->
        <div class="items-center hidden gap-1 mr-2 text-xs text-gray-500 sm:flex dark:text-gray-400">
          <Keyboard class="w-3 h-3" />
          <span>Cmd+Enter to run</span>
        </div>
        
        <!-- Error/Success Message -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="scale-95 opacity-0"
          enter-to-class="scale-100 opacity-100"
          leave-active-class="transition-all duration-200 ease-in"
          leave-from-class="scale-100 opacity-100"
          leave-to-class="scale-95 opacity-0"
        >
          <div v-if="error || successMessage" class="flex items-center gap-2 mr-2">
            <div v-if="error" class="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
              <AlertCircle class="w-3.5 h-3.5" />
              <span>{{ error }}</span>
            </div>
            <div v-if="successMessage && !error" class="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
              <CheckCircle2 class="w-3.5 h-3.5" />
              <span>{{ successMessage }}</span>
            </div>
          </div>
        </Transition>
        
        <!-- Action Buttons -->
        <button
          @click="clearEditor"
          class="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Clear query"
        >
          <FileX class="w-4 h-4" />
        </button>
        
        <button
          @click="formatQuery"
          class="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Format query"
        >
          <Wand2 class="w-4 h-4" />
        </button>
        
        <div class="w-px h-5 bg-gray-200 dark:bg-gray-700"></div>
        
        <button
          @click="handleExecute"
          :disabled="isLoading || !currentQuery.trim()"
          class="flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          <component :is="isLoading ? Loader2 : Play" :class="['w-3.5 h-3.5', isLoading && 'animate-spin']" />
          {{ isLoading ? 'Running...' : 'Run Query' }}
        </button>
      </div>
    </div>
    
    <!-- Editor Content -->
    <div v-if="activeMode === 'query'" ref="editorContainer" class="flex-1 overflow-hidden"></div>
    
    <!-- Examples Panel -->
    <div v-else class="flex-1 p-4 overflow-y-auto">
      <div class="space-y-3">
        <div
          v-for="(example, index) in queryExamples"
          :key="index"
          class="relative p-3 transition-colors rounded-lg cursor-pointer group bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
          @click="useExample(example)"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <h4 class="mb-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                {{ example.title }}
              </h4>
              <p class="mb-2 text-xs text-gray-600 dark:text-gray-400">
                {{ example.description }}
              </p>
              <pre class="p-2 font-mono text-xs text-gray-700 bg-gray-100 rounded dark:text-gray-300 dark:bg-gray-900">{{ example.query }}</pre>
            </div>
            <button
              class="p-1 transition-all rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-600"
              title="Use this example"
            >
              <ArrowRight class="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Status Bar -->
    <div class="flex items-center justify-between px-4 py-2 text-xs border-t border-gray-200 bg-gray-50 dark:bg-gray-900 dark:border-gray-700">
      <div class="flex items-center gap-4">
        <span class="text-gray-500 dark:text-gray-400">
          Line {{ cursorLine }}, Col {{ cursorCol }}
        </span>
        <span v-if="lastExecutionTime" class="text-gray-500 dark:text-gray-400">
          Last run: {{ lastExecutionTime }}ms
        </span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-gray-500 dark:text-gray-400">JavaScript</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { 
  Play, 
  Loader2, 
  AlertCircle, 
  CheckCircle2,
  FileX,
  Wand2,
  Keyboard,
  ArrowRight
} from 'lucide-vue-next';
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

// UI State
const activeMode = ref<'query' | 'examples'>('query');
const successMessage = ref('');
const lastExecutionTime = ref<number | null>(null);
const cursorLine = ref(1);
const cursorCol = ref(1);

// Query Examples
const queryExamples = [
  {
    title: 'Query All Threads',
    description: 'Retrieve all threads with a limit of 10',
    query: `return qx(EARS.Entity.Thread).limit(10);`
  },
  {
    title: 'Filter Active Agents',
    description: 'Get all agents with active status',
    query: `return qx(EARS.Entity.Agent).where('status', 'active');`
  },
  {
    title: 'Query with Relations',
    description: 'Get entities with their relations',
    query: `return qx(EARS.Entity.Flow).linksTo('contains', EARS.Entity.Node);`
  }
];

const createExtensions = () => [
  minimalSetup,
  history(),
  keymap.of([
    ...defaultKeymap, 
    ...historyKeymap,
    {
      key: 'Mod-Enter',
      run: () => {
        handleExecute();
        return true;
      }
    }
  ]),
  javascript({ typescript: true }),
  oneDark,
  EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '14px',
      backgroundColor: '#282c34', /* Match oneDark background */
    },
    '.cm-editor': {
      backgroundColor: '#282c34',
      height: '100%',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
      backgroundColor: '#282c34',
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
    /* Firefox scrollbar */
    '.cm-scroller': {
      scrollbarWidth: 'thin',
      scrollbarColor: 'rgba(155, 155, 155, 0.3) transparent',
    },
  }),
  EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      actor.send({
        type: 'QUERY.UPDATE',
        code: update.state.doc.toString()
      });
    }
    
    // Update cursor position
    const main = update.state.selection.main;
    const line = update.state.doc.lineAt(main.head);
    cursorLine.value = line.number;
    cursorCol.value = main.head - line.from + 1;
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

// Watch for external changes to the query
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

// Clear success message after delay
watch(successMessage, (msg) => {
  if (msg) {
    setTimeout(() => {
      successMessage.value = '';
    }, 3000);
  }
});

// Watch for mode changes to reinitialize editor
watch(activeMode, async (newMode) => {
  if (newMode === 'query') {
    await nextTick();
    
    // Destroy existing editor if any
    if (editorView) {
      editorView.destroy();
      editorView = null;
    }
    
    // Create new editor
    if (editorContainer.value) {
      editorView = new EditorView({
        doc: currentQuery.value,
        extensions: createExtensions(),
        parent: editorContainer.value,
      });
    }
  }
});

function handleExecute() {
  if (!isLoading.value && editorView && currentQuery.value.trim()) {
    const startTime = Date.now();
    
    actor.send({
      type: 'QUERY.EXECUTE',
      code: editorView.state.doc.toString()
    });
    
    // Simulate execution time tracking
    setTimeout(() => {
      if (!error.value) {
        lastExecutionTime.value = Date.now() - startTime;
        successMessage.value = 'Query executed successfully';
      }
    }, 100);
  }
}

function clearEditor() {
  if (editorView) {
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: '',
      },
    });
  }
}

function formatQuery() {
  // Simple formatting - in real implementation, use a proper formatter
  if (editorView) {
    const code = editorView.state.doc.toString();
    const formatted = code
      .replace(/\s+/g, ' ')
      .replace(/;\s*/g, ';\n')
      .trim();
    
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: formatted,
      },
    });
  }
}

function useExample(example: { query: string }) {
  // First update the query in the state
  actor.send({
    type: 'QUERY.UPDATE',
    code: example.query
  });
  
  // Then switch to query mode
  activeMode.value = 'query';
}
</script> 