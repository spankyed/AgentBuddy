<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4 px-6 py-3 border-b border-neutral-800">
      <div>
        <h2 class="text-base font-semibold text-neutral-100">{{ action?.label }}</h2>
        <p class="text-xs text-neutral-400">Action Details</p>
      </div>
      <div class="flex items-center gap-2">
        <Button
          @click="$emit('back')"
          variant="transparent"
        >
          Back
        </Button>
        <Button
          @click="$emit('edit')"
          variant="primary"
        >
          <Edit2 class="w-4 h-4" />
          Edit Action
        </Button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-4xl p-6 mx-auto">
        <div class="space-y-6">
          <!-- Basic Info -->
          <div class="space-y-4">
            <!-- Description -->
            <div v-if="action?.description">
              <h3 class="mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Description</h3>
              <p class="text-sm text-neutral-300">{{ action.description }}</p>
            </div>

            <!-- Category -->
            <div>
              <h3 class="mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Category</h3>
              <span
                class="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-md"
                :class="categoryStyle(action?.category)"
              >
                {{ action?.category || 'Uncategorized' }}
              </span>
            </div>
          </div>

          <!-- Parameters -->
          <div class="pt-6 border-t border-neutral-800">
            <h3 class="mb-4 text-xs font-medium tracking-wider uppercase text-neutral-400">Input Parameters</h3>
            <div v-if="action?.input && Object.keys(action.input).length > 0" class="space-y-3">
              <div
                v-for="(param, key) in action.input"
                :key="key"
                class="p-4 border rounded-md bg-neutral-800/50 border-neutral-700"
              >
                <div class="flex items-start justify-between">
                  <div class="space-y-1">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-neutral-100">{{ key }}</span>
                      <span class="text-xs text-neutral-500">({{ param.type }})</span>
                      <span v-if="param.required" class="text-xs text-red-400">required</span>
                    </div>
                    <p v-if="param.description" class="text-sm text-neutral-400">{{ param.description }}</p>
                    <p v-if="param.default !== undefined" class="text-xs text-neutral-500">
                      Default: <code class="px-1 py-0.5 rounded bg-neutral-800 text-neutral-300">{{ param.default }}</code>
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="p-8 text-center border-2 border-dashed rounded-lg border-neutral-700">
              <p class="text-sm text-neutral-400">No parameters defined</p>
            </div>
          </div>

          <!-- Action Function -->
          <div class="pt-6 border-t border-neutral-800">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-xs font-medium tracking-wider uppercase text-neutral-400">Action Function</h3>
              <button
                @click="openInEditor"
                class="flex items-center gap-1 px-2 py-1 text-xs transition-colors rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
              >
                <ExternalLink class="w-3 h-3" />
                Open in editor
              </button>
            </div>
            <div class="overflow-hidden border rounded-md border-neutral-700" style="height: 400px;">
              <ActionFunctionViewer :code="action?.actionFn || ''" />
            </div>
          </div>

          <!-- Output -->
          <div v-if="action?.output" class="pt-6 border-t border-neutral-800">
            <h3 class="mb-4 text-xs font-medium tracking-wider uppercase text-neutral-400">Expected Output</h3>
            <pre class="p-4 overflow-auto text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-300">{{ JSON.stringify(action.output, null, 2) }}</pre>
          </div>

          <!-- Metadata -->
          <div class="pt-6 border-t border-neutral-800">
            <h3 class="mb-4 text-xs font-medium tracking-wider uppercase text-neutral-400">Metadata</h3>
            <dl class="grid grid-cols-2 gap-4">
              <div>
                <dt class="text-xs text-neutral-500">Created</dt>
                <dd class="text-sm text-neutral-300">{{ formatDate(action?.createdAt) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-neutral-500">Updated</dt>
                <dd class="text-sm text-neutral-300">{{ formatDate(action?.updatedAt) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-neutral-500">ID</dt>
                <dd class="font-mono text-sm text-neutral-300">{{ action?.id }}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ActionEntity } from '@abuddy/api';
import { Edit2, ExternalLink } from 'lucide-vue-next';
import Button from '@/core/design/button.vue';
import ActionFunctionViewer from './ActionFunctionViewer.vue';
import { applicationState } from '@/app';

const props = defineProps<{
  action?: ActionEntity;
}>();

defineEmits<{
  edit: [];
  back: [];
}>();

function openInEditor() {
  if (!props.action) return;
  
  // First, switch to the code plugin
  applicationState.send({ type: 'SELECT_PLUGIN', pluginId: 'code' });
  
  // Give the code plugin time to activate, then send the action to open
  setTimeout(() => {
    const codeActor = applicationState.system.get('code');
    if (codeActor) {
      // First ensure the actions panel is selected
      codeActor.send({ 
        type: 'UPDATE_STATE', 
        updates: { selectedPanel: 'actions' } 
      });
      
      // Then send the open action event to the actions child actor
      const actionsActor = codeActor.system.get('codeActions');
      if (actionsActor) {
        actionsActor.send({ 
          type: 'codeActions.OPEN_ACTION', 
          actionId: props.action!.id 
        });
      }
    }
  }, 10);
}

function formatDate(timestamp?: number) {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleString();
}

function categoryStyle(category?: string) {
  const styles: Record<string, string> = {
    'database': 'bg-blue-900/30 text-blue-400 border border-blue-800/50',
    'communication': 'bg-green-900/30 text-green-400 border border-green-800/50',
    'integration': 'bg-yellow-900/30 text-yellow-400 border border-yellow-800/50',
    'utility': 'bg-purple-900/30 text-purple-400 border border-purple-800/50',
    'storage': 'bg-indigo-900/30 text-indigo-400 border border-indigo-800/50',
  }
  return styles[category || ''] || 'bg-neutral-800 text-neutral-400 border border-neutral-700'
}
</script>