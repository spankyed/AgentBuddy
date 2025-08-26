<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4 px-6 py-3 border-b border-neutral-800">
      <div>
        <h2 class="text-base font-semibold text-neutral-100">Create Thread</h2>
        <p class="text-xs text-neutral-400">
          <span v-if="parentThread">Creating as child of {{ parentThread.shortCode }} - {{ parentThread.topic || 'Untitled' }}</span>
          <span v-else>Add a new work thread for the agent</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button
          @click="actor.send({ type: 'CANCEL_CREATE' })"
          variant="transparent"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          :disabled="isSaving"
          variant="primary"
          @click="actor.send({ type: 'CREATE_THREAD' })"
        >
          Create Thread
        </Button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <div class="max-w-4xl p-6 mx-auto space-y-6">
        <!-- Topic & Status Section -->
        <div class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-[1fr,200px] gap-4">
            <div>
              <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Topic</label>
              <input
                :value="topic"
                @input="e => updateField('topic', (e.target as HTMLInputElement).value)"
                type="text"
                placeholder="Enter thread topic"
                class="w-full px-4 py-3 text-lg font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Status</label>
              <select
                disabled
                :value="settings?.statuses?.[0]?.label || 'Backlog'"
                class="w-full px-3 py-3 text-sm font-medium transition-colors border rounded-md opacity-50 cursor-not-allowed bg-neutral-800 border-neutral-700 text-neutral-300"
              >
                <option 
                  v-for="status in (settings?.statuses || [])" 
                  :key="status.label" 
                  :value="status.label"
                >
                  {{ status.label }}
                </option>
                <!-- Fallback if no settings loaded yet -->
                <option v-if="!settings?.statuses?.length" value="Backlog">Backlog</option>
              </select>
            </div>
          </div>

          <!-- Instructions -->
          <div>
            <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Instructions</label>
            <textarea
              :value="instructions"
              @input="e => updateField('instructions', (e.target as HTMLTextAreaElement).value)"
              rows="4"
              placeholder="Enter instructions for the agent"
              class="min-h-[8rem] w-full px-4 py-3 text-sm rounded-md bg-neutral-800 border border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500 transition-colors resize-y"
            ></textarea>
          </div>

          <!-- Tags -->
          <CollapsibleSection :default-open="false" class="pt-2">
            <template #label>
              <div class="flex items-center gap-2">
                <span>Tags</span>
                <div v-if="tags && tags.length > 0" class="flex items-center gap-1">
                  <span class="text-neutral-500 mr-1">•</span>
                  <div class="flex flex-wrap gap-1">
                    <span 
                      v-for="(tag, index) in tags.slice(0, 5)" 
                      :key="tag"
                      :style="getTagStyles(tag)"
                      class="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-md truncate"
                    >
                      {{ tag }}
                    </span>
                    <span v-if="tags.length > 5" class="px-2 py-0.5 text-xs text-neutral-400">
                      +{{ tags.length - 5 }} more
                    </span>
                  </div>
                </div>
              </div>
            </template>
            <TagInput 
              :modelValue="tags || []"
              :available-tags="availableTags"
              @update:modelValue="updateTags"
              class="w-full"
            />
          </CollapsibleSection>
        </div>

        <!-- Linked Threads Section -->
        <div class="pt-6 border-t border-neutral-800">
          <CollapsibleSection :default-open="false">
            <template #label>
              Linked Threads ({{ linkedThreads.length }})
            </template>
            <ThreadLinkInput
              :lite="true"
              v-model="linkedThreads"
              :available-threads="threadsList"
              :available-tags="availableTags"
              :settings="settings"
              @update:modelValue="(links) => updateField('linkedThreads', links)"
            />
          </CollapsibleSection>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id, type ThreadsState } from '@/plugins/threads/state';
import type { ThreadEditFields } from '@app/api'
import Button from '@/core/components/design/button.vue';
import TagInput from '@/core/components/design/tag-input.vue';
import ThreadLinkInput from '@/plugins/threads/canvas/link-thread-input.vue'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue';

const actor: ThreadsState = applicationState.system.get(id);
const topic = useSelector(actor, (state) => state.context.create.topic);
const instructions = useSelector(actor, (state) => state.context.create.instructions);
const tags = useSelector(actor, (state) => state.context.create.tags);
const availableTags = useSelector(actor, (state) => state.context.availableTags);
const linkedThreads = useSelector(actor, (state) => state.context.create.linkedThreads || []);
const threadsList = useSelector(actor, (state) => state.context.threads || []);
const settings = useSelector(actor, (state) => state.context.settings);

const isSaving = ref(false)

// Get parent thread from context if creating as child
const parentThread = useSelector(actor, (state) => state.context.create.parentThread);

// Update tags in state when TagInput changes
const updateTags = (newTags: string[]) => {
  console.log('newTags: ', newTags);
  actor.send({ 
    type: 'UPDATE_THREAD_FIELD',
    state: 'create',
    key: 'tags',
    value: newTags,
  });
};

const addThread = () => {
  actor.send({ type: 'LINK_THREAD' })
}

const removeThread = (index: number) => {
  actor.send({ type: 'REMOVE_LINK', index })
}

const updateField = (key: keyof ThreadEditFields, value: ThreadEditFields[keyof ThreadEditFields]) => {
  console.log('updateField', key, value);
  actor.send({ type: 'UPDATE_THREAD_FIELD', key, value, state: 'create' });
}

const getTagStyles = (tagName: string) => {
  const color = availableTags.value?.find(t => t.name === tagName)?.color || '#A855F7';
  return {
    backgroundColor: `${color}1A`, // 10% opacity
    color,
    border: `1px solid ${color}33` // 20% opacity for border
  };
};

</script> 