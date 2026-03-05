<template>
  <div class="flex flex-col h-full border-r border-neutral-800">
    <QueryEditorHeader
      :active-mode="activeMode"
      @update:active-mode="$emit('update:activeMode', $event)"
      :is-loading="isLoading"
      :current-query="currentQuery"
      :error="error"
      :success-message="successMessage"
      :mode="mode"
      :execute-query="settings?.hotkeys?.executeQuery"
      @execute="handleExecute"
      @clear="handleClear"
      @ai-query="showAiQueryDialog = true"
      @toggle-mode="handleToggleMode"
    />

    <div class="flex-1 overflow-hidden relative">
      <SimpleMonacoEditor
        v-if="activeMode === 'query'"
        v-model="editorQuery"
        language="typescript"
        :function-body="true"
        dsl-type="database"
        :actions="['executeCode']"
        :execute-keybinding="settings?.hotkeys?.executeQuery || undefined"
        @execute="handleExecute"
        class="h-full"
      />

      <QueryEditorExamples
        v-else
        @select="handleExampleSelect"
      />

      <!-- Loading overlay for AI query generation -->
      <Transition
        enter-active-class="transition-opacity duration-200"
        leave-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
      >
        <div
          v-if="isAiQueryLoading && activeMode === 'query'"
          class="absolute inset-0 flex items-center justify-center bg-neutral-900/80 backdrop-blur-sm z-10"
        >
          <div class="flex flex-col items-center space-y-3">
            <!-- Loading spinner -->
            <div class="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <div class="text-sm text-neutral-300">
              Generating query from prompt...
            </div>
          </div>
        </div>
      </Transition>
    </div>


    <AiQueryDialog
      v-model="showAiQueryDialog"
      @generate="handleAiQuery"
      @cancel="showAiQueryDialog = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSelector } from '@xstate/vue';
import { id, type DatabaseState } from '../state';
import { applicationState } from '@/main';
import QueryEditorHeader from './query-editor/QueryEditorHeader.vue';
import SimpleMonacoEditor from '@/core/components/SimpleMonacoEditor.vue';
import QueryEditorExamples from './query-editor/QueryEditorExamples.vue';
import AiQueryDialog from './query-editor/AiQueryDialog.vue';

const actor: DatabaseState = applicationState.system.get(id);
const currentQuery = useSelector(actor, (state) => state.context.currentQuery);
const isLoading = useSelector(actor, (state) => state.context.isLoading);
const error = useSelector(actor, (state) => state.context.error);
const mode = useSelector(actor, (state) => state.context.mode);
const settings = useSelector(actor, (state) => state.context.settings);
const isAiQueryLoading = useSelector(actor, (state) => state.context.isAiQueryLoading);

// Props and emits
defineProps<{
  activeMode: 'query' | 'examples';
}>();

const emit = defineEmits<{
  'update:activeMode': [mode: 'query' | 'examples'];
}>();

// Local state
const successMessage = ref('');
const showAiQueryDialog = ref(false);
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
    }, SUCCESS_MESSAGE_TIMEOUT);
  }
});

const SUCCESS_MESSAGES = {
  query: 'Query executed successfully',
  transaction: 'Transaction executed successfully'
} as const;

const SUCCESS_MESSAGE_DELAY = 100;
const SUCCESS_MESSAGE_TIMEOUT = 3000;

function handleExecute() {
  if (!isLoading.value && editorQuery.value.trim()) {
    actor.send({
      type: mode.value === 'query' ? 'QUERY.EXECUTE' : 'TRANSACTION.EXECUTE',
      code: editorQuery.value
    });
    
    // Show success message after a delay if no error
    setTimeout(() => {
      if (!error.value) {
        successMessage.value = SUCCESS_MESSAGES[mode.value];
      }
    }, SUCCESS_MESSAGE_DELAY);
  }
}

function handleClear() {
  editorQuery.value = '';
}

function handleAiQuery(prompt: string) {
  showAiQueryDialog.value = false;
  actor.send({
    type: 'AI_QUERY.GENERATE',
    prompt
  });
}

function handleExampleSelect(query: string) {
  editorQuery.value = query;
  emit('update:activeMode', 'query');
}


function handleToggleMode() {
  actor.send({
    type: 'MODE.TOGGLE'
  });
}
</script> 