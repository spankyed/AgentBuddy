<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4 px-6 py-3 border-b border-neutral-800 bg-neutral-900">
      <div class="flex items-center gap-4">
        <Button
          @click="actor.send({ type: 'GO_BACK' })"
          variant="transparent"
          class="!p-2"
        >
          <ArrowLeft class="w-4 h-4" />
        </Button>
        <div>
          <h2 class="text-base font-semibold text-neutral-100">Thread Details</h2>
          <p class="text-xs text-neutral-400">{{ topic || 'Untitled thread' }}</p>
        </div>
      </div>
      <Button 
        @click="actor.send({ type: 'OPEN_THREAD_CHAT', threadId })"
        variant="primary"
      >
        <MessageCircleMore class="w-4 h-4" />
        <span>Open Chat</span>
      </Button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <div class="max-w-4xl p-6 mx-auto space-y-6">
        <!-- Topic & Status Section -->
        <div class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-[1fr,200px] gap-4">
            <div>
              <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Topic</label>
              <div
                v-show="!isEditingTopic"
                @click="startEditingTopic"
                class="w-full px-4 py-3 text-lg font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 cursor-text hover:border-neutral-600"
              >
                {{ topic || 'Untitled thread' }}
              </div>
              <input
                ref="topicInput"
                v-show="isEditingTopic"
                :value="topic"
                @input="e => updateField('topic', (e.target as HTMLInputElement).value)"
                @blur="isEditingTopic = false"
                @keydown.enter="isEditingTopic = false"
                type="text"
                placeholder="Enter thread topic"
                class="w-full px-4 py-3 text-lg font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-600 text-neutral-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Status</label>
              <select
                :value="status"
                @input="e => updateField('status', (e.target as HTMLSelectElement).value ?? '')"
                class="w-full px-3 py-3 text-sm font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 hover:border-neutral-600 focus:outline-none focus:border-blue-500"
              >
                <option value="backlog">Backlog</option>
                <option value="open">Open</option>
                <option value="in-progress">In Progress</option>
                <option value="in-review">In Review</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>

          <!-- Instructions & Type -->
          <div class="grid grid-cols-1 md:grid-cols-[1fr,200px] gap-4">
            <div>
              <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Instructions</label>
              <div
                v-show="!isEditingInstructions"
                @click="startEditingInstructions"
                class="min-h-[8rem] px-4 py-3 rounded-md bg-neutral-800 border border-neutral-700 cursor-text hover:border-neutral-600 transition-colors"
              >
                <p class="text-sm whitespace-pre-wrap text-neutral-300">{{ instructions || 'Click to add agent instructions...' }}</p>
              </div>
              <textarea
                ref="instructionsInput"
                v-show="isEditingInstructions"
                :value="instructions"
                @input="e => updateField('instructions', (e.target as HTMLTextAreaElement).value)"
                @blur.passive="isEditingInstructions = false"
                placeholder="Enter instructions for the agent"
                class="min-h-[8rem] w-full px-4 py-3 text-sm rounded-md bg-neutral-800 border border-neutral-600 text-neutral-100 focus:outline-none focus:border-blue-500 transition-colors resize-y"
              ></textarea>
            </div>
            <div>
              <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Type</label>
              <select
                :value="type"
                @input="e => updateField('threadType', (e.target as HTMLSelectElement).value)"
                class="w-full px-3 py-3 text-sm font-medium transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 hover:border-neutral-600 focus:outline-none focus:border-blue-500"
              >
                <option value="work-item">Work Item</option>
                <option value="project">Project</option>
              </select>
            </div>
          </div>

          <!-- Tags -->
          <div>
            <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">Tags</label>
            <TagInput 
              v-model="tagNames"
              :available-tags="availableTags"
              @update:modelValue="(newTags) => updateField('tags', newTags)"
              class="w-full"
            />
          </div>
        </div>

        <!-- Messages Section -->
        <div class="pt-6 border-t border-neutral-800">
          <button
            :disabled="messages.length === 0"
            @click="isMessagesOpen = !isMessagesOpen"
            :class="[
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all',
              messages.length === 0 
                ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed' 
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100'
            ]"
          >
            <ChevronDown 
              :size="16" 
              :class="['transition-transform', isMessagesOpen ? 'rotate-180' : '']"
            />
            <span>Messages ({{ messages.length }})</span>
          </button>
          <div v-if="isMessagesOpen" class="mt-4">
            <MessageList :is-messages-open="isMessagesOpen" :messages="messages" />
          </div>
        </div>

        <!-- Linked Threads Section -->
        <div class="pt-6 border-t border-neutral-800">
          <label class="block mb-4 text-xs font-medium tracking-wider uppercase text-neutral-400">Linked Threads</label>
          <ThreadLinkInput
            v-model="linkedThreads"
            :available-threads="threadsList"
            @chat-click="(id) => actor.send({ type: 'OPEN_THREAD_CHAT', threadId: id })"
            @select="(id) => actor.send({ type: 'SELECT_THREAD', id })"
            @status-change="(id, status) => actor.send({ type: 'UPDATE_THREAD_STATUS', id, status })"
            @update:modelValue="(links) => updateField('linkedThreads', links)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { X, ChevronDown, MessageCircleMore, ArrowLeft } from 'lucide-vue-next'
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
const status = useSelector(actor, (state) => state.context.view.status || 'backlog');
const instructions = useSelector(actor, (state) => state.context.view.instructions || '');
const threadsList = useSelector(actor, (state) => state.context.threads || []);

const updateField = (key: keyof ThreadEditFields, value: ThreadEditFields[keyof ThreadEditFields] | undefined) => {
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
    const messagesContainer = document.querySelector('.messages-container')
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight
    }
  }
})
</script>