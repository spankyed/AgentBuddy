<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4 px-6 py-3 border-b border-neutral-800">
      <div class="flex items-center gap-4">
        <Button
          @click="$emit('back')"
          variant="transparent"
          class="!p-2"
        >
          <ArrowLeft class="w-4 h-4" />
        </Button>
        <div>
          <h2 class="text-base font-semibold text-neutral-100">Prompt Details</h2>
          <p class="text-xs text-neutral-400">{{ prompt?.label || 'Untitled prompt' }}</p>
        </div>
      </div>
      <Button 
        @click="$emit('edit')"
        variant="primary"
      >
        <Edit2 class="w-4 h-4" />
        <span>Edit Prompt</span>
      </Button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto custom-scrollbar" v-if="prompt">
      <div class="max-w-4xl p-6 mx-auto space-y-6">
        <!-- Basic Info -->
        <div class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-[1fr,200px] gap-4">
            <div>
              <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Name</label>
              <div class="w-full px-4 py-3 text-lg font-medium border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100">
                {{ prompt.label }}
              </div>
            </div>
            <div v-if="prompt.category">
              <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Category</label>
              <div class="w-full px-3 py-3 text-sm font-medium border rounded-md bg-neutral-800 border-neutral-700">
                <span
                  class="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-md"
                  :class="categoryStyle(prompt.category)"
                >
                  {{ prompt.category }}
                </span>
              </div>
            </div>
          </div>
          
          <div v-if="prompt.description">
            <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Description</label>
            <div class="px-4 py-3 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-300">
              {{ prompt.description || 'No description provided' }}
            </div>
          </div>
        </div>

        <!-- Input Parameters -->
        <div class="pt-6 border-t border-neutral-800">
          <label class="block mb-4 text-xs font-medium tracking-wider uppercase text-neutral-400">Input Parameters</label>
          <div v-if="Object.keys(prompt.inputs || {}).length > 0" class="space-y-3">
            <div 
              v-for="(input, key) in prompt.inputs" 
              :key="key"
              class="p-4 border rounded-md bg-neutral-800 border-neutral-700"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <h4 class="text-sm font-medium text-neutral-100">
                    {{ input.name }}
                    <span v-if="input.required !== false" class="text-red-400">*</span>
                  </h4>
                  <p v-if="input.description" class="mt-1 text-sm text-neutral-400">
                    {{ input.description }}
                  </p>
                </div>
                <span class="px-2 py-1 text-xs font-medium border rounded bg-neutral-700 border-neutral-600 text-neutral-300">
                  {{ input.type }}
                </span>
              </div>
              <div v-if="input.defaultValue !== undefined" class="mt-3">
                <span class="text-xs text-neutral-500">Default:</span>
                <code class="px-2 py-1 ml-2 text-xs rounded bg-neutral-900 text-neutral-300">
                  {{ JSON.stringify(input.defaultValue) }}
                </code>
              </div>
            </div>
          </div>
          <p v-else class="text-sm text-neutral-400">No input parameters defined</p>
        </div>

        <!-- Template Function -->
        <div class="pt-6 border-t border-neutral-800">
          <div class="flex items-center justify-between mb-4">
            <label class="text-xs font-medium tracking-wider uppercase text-neutral-400">Template Function</label>
            <button
              @click="openInEditor"
              class="flex items-center gap-1 px-2 py-1 text-xs transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
            >
              <ExternalLink class="w-3 h-3" />
              Open in editor
            </button>
          </div>
          <div class="overflow-hidden border rounded-md border-neutral-700" style="height: 300px;">
            <PromptTemplateViewer :value="prompt.templateFn" />
          </div>
        </div>

        <!-- Output Schema -->
        <div v-if="prompt.outputSchema" class="pt-6 border-t border-neutral-800">
          <label class="block mb-4 text-xs font-medium tracking-wider uppercase text-neutral-400">Output Schema</label>
          <pre class="p-4 overflow-auto text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-300">{{ JSON.stringify(prompt.outputSchema, null, 2) }}</pre>
        </div>

        <!-- Metadata -->
        <div class="pt-6 border-t border-neutral-800">
          <label class="block mb-4 text-xs font-medium tracking-wider uppercase text-neutral-400">Metadata</label>
          <div class="grid grid-cols-1 gap-3 p-4 text-sm border rounded-md md:grid-cols-2 bg-neutral-800 border-neutral-700">
            <div>
              <span class="text-neutral-500">Created:</span>
              <span class="ml-2 text-neutral-100">
                {{ new Date(prompt.createdAt).toLocaleString() }}
              </span>
            </div>
            <div v-if="prompt.updatedAt">
              <span class="text-neutral-500">Updated:</span>
              <span class="ml-2 text-neutral-100">
                {{ new Date(prompt.updatedAt).toLocaleString() }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowLeft, Edit2, ExternalLink } from 'lucide-vue-next';
import Button from '@/core/design/button.vue';
import type { PromptEntity } from '@abuddy/api';
import PromptTemplateViewer from './PromptTemplateViewer.vue';
import { applicationState } from '@/app';

const props = defineProps<{
  prompt?: PromptEntity;
}>();

defineEmits<{
  edit: [];
  back: [];
}>();

// Professional category styling (matching PromptsList.vue)
function categoryStyle(category?: string) {
  switch (category) {
    case 'text-processing':
      return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
    case 'development':
      return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    case 'assistant':
      return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
    default:
      return 'bg-neutral-800 text-neutral-400 border border-neutral-700';
  }
}

function openInEditor() {
  if (!props.prompt) return;
  
  // First, switch to the code plugin
  applicationState.send({ type: 'SELECT_PLUGIN', pluginId: 'code' });
  
  // Give the code plugin time to activate, then send the prompt to open
  setTimeout(() => {
    const codeActor = applicationState.system.get('code');
    if (codeActor) {
      // First ensure the prompts panel is selected
      codeActor.send({ 
        type: 'UPDATE_STATE', 
        updates: { selectedPanel: 'prompts' } 
      });
      
      // Then send the open prompt event to the prompts child actor
      const promptsActor = codeActor.system.get('codePrompts');
      if (promptsActor) {
        promptsActor.send({ 
          type: 'codePrompts.OPEN_PROMPT', 
          promptId: props.prompt!.id 
        });
      }
    }
  }, 10);
}
</script> 