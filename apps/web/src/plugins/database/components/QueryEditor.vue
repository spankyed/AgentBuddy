<template>
  <div class="flex flex-col h-full border-r border-neutral-800">
    <QueryEditorHeader
      v-model:active-mode="activeMode"
      :is-loading="isLoading"
      :current-query="currentQuery"
      :error="error"
      :success-message="successMessage"
      @execute="handleExecute"
      @clear="handleClear"
      @format="handleFormat"
    />
    
    <div class="flex-1 overflow-hidden">
      <CodeMirrorEditor
        v-if="activeMode === 'query'"
        v-model="editorQuery"
        @execute="handleExecute"
        @cursor-change="updateCursorPosition"
      />
      
      <QueryEditorExamples
        v-else
        @select="handleExampleSelect"
      />
    </div>
    
    <!-- <QueryEditorStatusBar
      :cursor-line="cursorLine"
      :cursor-col="cursorCol"
    /> -->
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useSelector } from '@xstate/vue';
import { id, type DatabaseState } from '../state';
import { applicationState } from '@/app';
import QueryEditorHeader from './query-editor/QueryEditorHeader.vue';
import CodeMirrorEditor from './query-editor/CodeMirrorEditor.vue';
import QueryEditorExamples from './query-editor/QueryEditorExamples.vue';
// import QueryEditorStatusBar from './query-editor/QueryEditorStatusBar.vue';

const actor: DatabaseState = applicationState.system.get(id);
const currentQuery = useSelector(actor, (state) => state.context.currentQuery);
const isLoading = useSelector(actor, (state) => state.context.isLoading);
const error = useSelector(actor, (state) => state.context.error);

// Local state
const activeMode = ref<'query' | 'examples'>('query');
const successMessage = ref('');
// const cursorLine = ref(1);
// const cursorCol = ref(1);
const editorQuery = ref(currentQuery.value);

// Sync editor query with state
watch(currentQuery, (newQuery) => {
  editorQuery.value = newQuery;
});

watch(editorQuery, (newQuery) => {
  actor.send({
    type: 'QUERY.UPDATE',
    code: newQuery
  });
});

// Clear success message after delay
watch(successMessage, (msg) => {
  if (msg) {
    setTimeout(() => {
      successMessage.value = '';
    }, 3000);
  }
});

function handleExecute() {
  if (!isLoading.value && editorQuery.value.trim()) {
    actor.send({
      type: 'QUERY.EXECUTE',
      code: editorQuery.value
    });
    
    // Show success message after a delay if no error
    setTimeout(() => {
      if (!error.value) {
        successMessage.value = 'Query executed successfully';
      }
    }, 100);
  }
}

function handleClear() {
  editorQuery.value = '';
}

function handleFormat() {
  // Simple formatting - in real implementation, use a proper formatter
  editorQuery.value = editorQuery.value
    .replace(/\s+/g, ' ')
    .replace(/;\s*/g, ';\n')
    .trim();
}

function handleExampleSelect(query: string) {
  editorQuery.value = query;
  activeMode.value = 'query';
}

function updateCursorPosition({ line, col }: { line: number; col: number }) {
  // cursorLine.value = line;
  // cursorCol.value = col;
}
</script> 