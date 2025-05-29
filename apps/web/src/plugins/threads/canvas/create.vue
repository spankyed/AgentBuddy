<template>
  <div class="max-w-5xl px-6 py-4 mx-auto space-y-6">
    <div class="p-4 space-y-6">
      <!-- Topic & Status -->
      <div class="flex flex-col items-center gap-4 md:flex-row">
        <div class="flex-1">
          <!-- <Label>Topic</Label> -->
          <input
            :value="topic"
            @input="e => updateField('topic', e.target as HTMLInputElement)"
            type="text"
            placeholder="Thread Topic"
            class="w-full px-3 py-2 text-xl rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <div class="w-full md:w-40">
          <!-- <Label>Type</Label> -->
          <select
            :value="threadType"
            @input="e => updateField('threadType', e.target as HTMLSelectElement)"
            class="w-full px-3 py-2 text-sm rounded bg-neutral-900 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
          >
            <option value="work-item">Work Item</option>
            <option value="project">Project</option>
          </select>
        </div>
      </div>

      <!-- Instructions -->
      <div>
        <!-- <Label>Instructions</Label> -->
        <textarea
          :value="instructions"
          @input="e => updateField('instructions', e.target as HTMLTextAreaElement)"
          rows="4"
          placeholder="Enter instructions for the agent"
          class="w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600 border border-neutral-700 min-h-[80px] max-h-[200px] resize-y"
        ></textarea>
      </div>

      <!-- Tags & Related Threads -->
      <div class="flex flex-wrap gap-2">
        <div class="flex flex-wrap flex-1 gap-2">
          <button
            type="button"
            @click="addThread"
            class="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors rounded h-7 text-neutral-200 bg-neutral-700 hover:bg-neutral-600"
          >
            Link Thread
            <Plus :size="16" class="text-neutral-500" />
          </button>

          <span
            v-for="(thread, index) in relatedThreads"
            :key="index"
            class="inline-flex items-center pl-3 py-0.5 text-sm bg-neutral-700 text-neutral-200 rounded"
          >
            {{ thread }}
            <button
              type="button"
              @click="removeThread(index)"
              class="p-1 ml-1 rounded focus:outline-none"
            >
              <X :size="16" class="text-neutral-400 hover:text-neutral-200" />
            </button>
          </span>
        </div>

        <TagInput 
          v-model="tagNames"
          :available-tags="availableTags"
          @update:modelValue="updateTags"
        />
      </div>

      <div class="flex items-center justify-end gap-2">
        <!-- Stop button -->
        <button
          topic="Cancel thread creation"
          type="submit"
          @click="actor.send({ type: 'CANCEL_CREATE' })"
          :class="[
            'px-4 py-2 h-7 rounded text-sm font-medium transition-colors flex items-center gap-2 hover:bg-neutral-700 text-neutral-500 hover:text-white',
          ]"
        >
          Cancel
          <Square :size="22" />
        </button>
        <!-- @click="actor.send({ type: 'CREATE_THREAD' })" -->
        <Button
          type="submit"
          :disabled="isSaving"
          variant="primary"
          @click="actor.send({ type: 'CREATE_THREAD' })"
        >
          Create
        </Button>
      </div>

      <div>
        <!-- <button
          type="button"
          @click="addDetail"
          class="px-3 py-1.5 text-sm font-medium text-white rounded bg-neutral-700 hover:bg-neutral-600"
        >
          + Add Detail
        </button> -->
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { X, Plus } from 'lucide-vue-next'
import { applicationState } from '@/app'
import { useSelector } from '@xstate/vue'
import Label from '@/core/design/label.vue'
import { id, type ThreadsState } from '@/plugins/threads/state';
import type { ThreadTagItem, ThreadEditFields } from '@abuddy/api'
import Button from '@/core/design/button.vue';
import TagInput from './tag-input.vue';

const actor: ThreadsState = applicationState.system.get(id);
const topic = useSelector(actor, (state) => state.context.create.topic);
const instructions = useSelector(actor, (state) => state.context.create.instructions);
const threadType = useSelector(actor, (state) => state.context.create.threadType);
const relatedThreads = useSelector(actor, (state) => state.context.create.relatedThreads);
const tags = useSelector(actor, (state) => state.context.create.tags);
const availableTags = useSelector(actor, (state) => state.context.availableTags);

const isSaving = ref(false)

// Transform tags array to string array for TagInput
const tagNames = computed(() => {
  const tagList = tags.value || [];
  return tagList;
});

// Update tags in state when TagInput changes
const updateTags = (newTags: ThreadTagItem[]) => {
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

const updateField = (key: keyof ThreadEditFields, element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
  const value = element.value;
  actor.send({ type: 'UPDATE_THREAD_FIELD', key, value, state: 'create' });
}
</script> 