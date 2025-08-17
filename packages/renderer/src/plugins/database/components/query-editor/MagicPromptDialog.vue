<template>
  <Dialog
    :model-value="modelValue"
    title="Magic Prompt"
    description="Describe what query you want to generate in natural language"
    @update:model-value="$emit('update:modelValue', $event)"
    @cancel="$emit('cancel')"
  >
    <form id="magic-prompt-form" @submit.prevent="handleSubmit" class="space-y-4">
      <div>
        <textarea
          v-model="prompt"
          placeholder="e.g., Show me all agents with their associated flows and messages"
          class="w-full px-4 py-3 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500 placeholder-neutral-500 min-h-[120px] resize-y disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="isMagicPromptLoading"
          required
          autofocus
        />
      </div>
    </form>
    
    <template #actions>
      <Button variant="secondary" @click="$emit('cancel')">
        Cancel
      </Button>
      <Button type="submit" form="magic-prompt-form" :disabled="!prompt.trim() || isMagicPromptLoading">
        {{ isMagicPromptLoading ? 'Generating...' : 'Generate Query' }}
      </Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useSelector } from '@xstate/vue';
import Dialog from '@/core/components/design/dialog.vue';
import Button from '@/core/components/design/button.vue';
import { applicationState } from '@/main';
import { id, type DatabaseState } from '../../state';

defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  cancel: [];
  generate: [prompt: string];
}>();

const actor: DatabaseState = applicationState.system.get(id);
const isMagicPromptLoading = useSelector(actor, (state) => state.context.isMagicPromptLoading);

const prompt = ref('');

const handleSubmit = () => {
  if (prompt.value.trim()) {
    emit('generate', prompt.value.trim());
    prompt.value = '';
  }
};
</script>