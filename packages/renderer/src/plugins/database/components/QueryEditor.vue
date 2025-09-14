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
      @magic-prompt="showMagicPrompt = true"
      @save-snapshot="handleSaveSnapshot"
      @toggle-mode="handleToggleMode"
      @view-trace="handleViewTrace"
    />
    
    <div class="flex-1 overflow-hidden">
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
    </div>
    
    
    <MagicPromptDialog
      v-model="showMagicPrompt"
      @generate="handleMagicPrompt"
      @cancel="showMagicPrompt = false"
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
import MagicPromptDialog from './query-editor/MagicPromptDialog.vue';

const actor: DatabaseState = applicationState.system.get(id);
const currentQuery = useSelector(actor, (state) => state.context.currentQuery);
const isLoading = useSelector(actor, (state) => state.context.isLoading);
const error = useSelector(actor, (state) => state.context.error);
const snapshotMessage = useSelector(actor, (state) => state.context.snapshotMessage);
const mode = useSelector(actor, (state) => state.context.mode);
const settings = useSelector(actor, (state) => state.context.settings);

// Props and emits
defineProps<{
  activeMode: 'query' | 'examples';
}>();

const emit = defineEmits<{
  'update:activeMode': [mode: 'query' | 'examples'];
}>();

// Local state
const successMessage = ref('');
const showMagicPrompt = ref(false);
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

// Handle snapshot messages
watch(snapshotMessage, (msg) => {
  if (msg) {
    successMessage.value = msg;
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

function handleMagicPrompt(prompt: string) {
  showMagicPrompt.value = false;
  actor.send({
    type: 'MAGIC_PROMPT.GENERATE',
    prompt
  });
}

function handleExampleSelect(query: string) {
  editorQuery.value = query;
  emit('update:activeMode', 'query');
}


function handleSaveSnapshot() {
  actor.send({
    type: 'DATABASE.SAVE_SNAPSHOT'
  });
}

function handleToggleMode() {
  actor.send({
    type: 'MODE.TOGGLE'
  });
}

function handleViewTrace() {
  actor.send({
    type: 'VIEW_MODE.TOGGLE'
  });
}
</script> 