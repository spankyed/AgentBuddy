<template>
  <div class="max-w-5xl px-10 py-8 mx-auto root-container">
    <div class="space-y-4">
      <!-- Topic & Status -->
      <div class="flex flex-col items-center gap-4 md:flex-row">
        <div class="flex-1">
          <!-- <Label>Topic</Label> -->
          <div
            v-show="!isEditingTopic"
            @click="startEditingTopic"
            class="w-full px-3 py-2 text-xl rounded bg-neutral-800/40 text-neutral-200 cursor-text"
          >
            {{ topic || 'Untitled' }}
          </div>
          <input
            ref="topicInput"
            v-show="isEditingTopic"
            :value="topic"
            @input="e => updateField('topic', e.target.value)"
            @blur="isEditingTopic = false"
            @keydown.enter="isEditingTopic = false"
            type="text"
            placeholder="Thread Topic"
            class="w-full px-3 py-2 text-xl rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <div class="w-full md:w-40">
          <!-- <Label>Type</Label> -->
          <select
            :value="type"
            @input="e => updateField('threadType', e.target.value)"
            class="w-full px-3 py-2 text-sm rounded bg-neutral-900/60 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
          >
            <option value="work-item">Work Item</option>
            <option value="project">Project</option>
          </select>
        </div>
      </div>

      <!-- Instructions -->
      <div>
        <!-- <Label>Instructions</Label> -->
        <div
          v-show="!isEditingInstructions"
          @click="startEditingInstructions"
          class="px-3 py-2 border rounded-lg bg-neutral-800 border-neutral-700 cursor-text h-[8rem] overflow-y-auto"
        >
          <p class="text-sm text-neutral-300">{{ instructions || 'No agent instructions' }}</p>
        </div>
        <textarea
          ref="instructionsInput"
          v-show="isEditingInstructions"
          :value="instructions"
          @input="e => updateField('instructions', e.target.value)"
          @blur.passive="isEditingInstructions = false"
          placeholder="Enter instructions for the agent"
          class="h-[8rem] w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600 border border-neutral-700 resize-y"
        ></textarea>
      </div>

      <!-- Tags & Status -->
      <div class="flex items-start gap-2">
        <!-- Tags -->
        <TagInput 
          v-model="tagNames"
          :available-tags="availableTags"
          @update:modelValue="(newTags) => updateField('tags', newTags)"
          class="flex-1"
        />
        <!-- Status -->
        <div class="flex justify-end w-1/2">
          <select
            :value="status"
            @input="e => updateField('status', e.target.value)"
            class="w-32 px-3 py-2 text-sm rounded bg-neutral-900/60 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
          >
            <option value="draft">Draft</option>
            <option value="queued">Queued</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <!-- Messages Container -->
      <div class="mt-5">
        <div class="flex gap-2 pb-2">
          <button
            :disabled="messages.length === 0"
            @click="isMessagesOpen = !isMessagesOpen"
            :class="[
              'flex items-center justify-between px-2 py-0.5 text-sm font-medium rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700',
              { 'opacity-50': messages.length === 0 }
            ]"
          >
            <span>View Messages ({{ messages.length }})</span>
            <ChevronDown 
              :size="16" 
              :class="[`ml-1 transition-transform`, isMessagesOpen ? 'rotate-180' : '']"
            />
          </button>
          <button
            topic="Cancel thread creation"
            type="submit"
            @click="actor.send({ type: 'GO_BACK' })"
            :class="[
              'ml-auto pl-2 pr-3 py-2 h-7 rounded text-sm font-medium transition-colors flex items-center gap-2 hover:bg-neutral-700 text-neutral-500 hover:text-white',
            ]"
          >
            <ArrowLeft :size="16" />
            Back
          </button>
          <Button 
            type="button"
            variant="secondary"
            @click="actor.send({ type: 'OPEN_THREAD_CHAT', threadId })"
          >
            Chat About {{ topic.slice(0, 10) }}
            <Headset :size="16" class=""/>
          </Button>
        </div>
        <MessageList :is-messages-open="isMessagesOpen" :messages="messages" />
      </div>
    </div>

    <!-- Related Threads -->
    <ThreadLinkInput
      v-model="linkedThreads"
      :available-threads="threadsList"
      @update:modelValue="(links) => updateField('linkedThreads', links)"
      />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { X, ChevronDown, Headset, ArrowLeft } from 'lucide-vue-next'
import { applicationState } from '@/app'
import Label from '@/core/design/label.vue'
import type { Ref } from 'vue'
import { id, type ThreadsState } from '@/plugins/threads/state';
import { useSelector } from '@xstate/vue'
import Button from '@/core/design/button.vue'
import MessageList from './message-list.vue'
import TagInput from './tag-input.vue'
import ThreadLinkInput from '@/plugins/threads/canvas/link-thread-input.vue'
import type { TagEntity, ThreadTagItem, ThreadEditFields } from '@abuddy/api';

const actor: ThreadsState = applicationState.system.get(id);
const threadId = useSelector(actor, (state) => state.context.view.id);
const messages = useSelector(actor, (state) => state.context.view.messages || []);
const availableTags = useSelector(actor, (state) => state.context.availableTags);
const linkedThreads = useSelector(actor, (state) => state.context.view.linkedThreads || []);
const tags = useSelector(actor, (state) => state.context.view.tags || []);
const topic = useSelector(actor, (state) => state.context.view.topic || '');
const type = useSelector(actor, (state) => state.context.view.threadType || 'work-item');
const status = useSelector(actor, (state) => state.context.view.status || 'draft');
const instructions = useSelector(actor, (state) => state.context.view.instructions || '');
const threadsList = useSelector(actor, (state) => state.context.threads || []);

const updateField = (key: keyof ThreadEditFields, value: ThreadEditFields[keyof ThreadEditFields]) => {
  console.log('updateField', key, value);
  actor.send({ type: 'UPDATE_THREAD_FIELD', key, value, state: 'view' });
}

const isMessagesOpen = ref(false);
const isEditingTopic = ref(false);
const isEditingInstructions = ref(false);
const topicInput: Ref<HTMLInputElement | null> = ref(null);
const instructionsInput: Ref<HTMLTextAreaElement | null> = ref(null);
const tagNames = computed(() => {
  const tagList = tags.value || [];
  return tagList;
});

const startEditingTopic = () => {
  isEditingTopic.value = true;
  nextTick(() => {
    topicInput.value?.focus();
  });
};

const startEditingInstructions = () => {
  isEditingInstructions.value = true;
  nextTick(() => {
    instructionsInput.value?.focus();
  });
};

watch(isMessagesOpen, async (isOpen) => {
  if (isOpen) {
    await nextTick()
    const [messagesContainer, rootContainer] = [
      document.querySelector('.messages-container'),
      document.querySelector('.root-container')?.parentElement
    ]
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight
    }
    if (rootContainer) {
      rootContainer.scrollTop = rootContainer.scrollHeight
    }
  }
})
</script>

<style scoped>
.resize-handle {
  resize: vertical;
  overflow: auto;
}

.resize-handle::-webkit-resizer {
  border-width: .1rem;
  border-style: solid;
  border-color: transparent #3d3d3d #3d3d3d transparent;
  background-color: transparent;
}
</style>