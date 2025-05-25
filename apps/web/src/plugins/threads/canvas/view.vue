<template>
  <div class="max-w-5xl px-6 py-4 mx-auto space-y-6 root-container">
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
            :value="type"
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
        <Label>Instructions</Label>
        <div class="p-2 border rounded-lg bg-neutral-800 border-neutral-700">
          <p class="text-sm text-neutral-300">{{ instructions }}</p>
        </div>
      </div>

      <!-- Threads list -->
      <div>
        <!-- <Label>Related Threads</Label> -->
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            @click="() => actor.send({ type: 'ADD_THREAD' })"
            class="flex items-center gap-2 px-4 py-2 mr-2 text-sm font-medium transition-colors rounded h-7 text-neutral-200 bg-neutral-900/60 hover:bg-neutral-700"
          >
            Link Thread
            <Plus :size="16" class="text-neutral-300" />
          </button>

          <span
            v-for="(thread, index) in relatedThreads"
            :key="index"
            class="cursor-pointer inline-flex items-center pl-3 py-0.5 text-sm bg-neutral-900/60 text-neutral-200 rounded"
          >
            {{ thread.shortCode }}
            <button
              type="button"
              @click="() => actor.send({ type: 'REMOVE_THREAD', index })"
              class="p-1 ml-1 rounded focus:outline-none"
            >
              <X :size="16" class="text-neutral-400 hover:text-neutral-200" />
            </button>
          </span>
        </div>
      </div>

      <!-- Tags list -->
      <div>
        <!-- <Label>Tags</Label> -->
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            @click="() => actor.send({ type: 'ADD_TAG' })"
            class="flex items-center gap-2 px-4 py-2 mr-2 text-sm font-medium text-purple-200 transition-colors rounded hover:text-purple-100 h-7 bg-purple-900/30 hover:bg-purple-500/30"
          >
            Add Tag
            <Plus :size="16" class="text-purple-300" />
          </button>

          <span
            v-for="(tag, index) in tags"
            :key="index"
            class="inline-flex items-center pl-3 py-0.5 text-sm bg-purple-900/30 text-purple-200 rounded"
          >
            {{ tag.name }}
            <button
              type="button"
              @click="() => actor.send({ type: 'REMOVE_TAG', index })"
              class="p-1 ml-1 rounded focus:outline-none"
            >
              <X :size="16" class="text-purple-300 hover:text-purple-100" />
            </button>
          </span>
        </div>
      </div>

      <!-- Messages Container -->
      <div class="mt-5">
        <div class="flex gap-2 pb-2">
          <button
            v-if="messages.length > 0"
            @click="isMessagesOpen = !isMessagesOpen"
            class="flex items-center justify-between px-2 py-0.5 text-sm font-medium rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
          >
            <span>View Messages ({{ messages.length }})</span>
            <ChevronDown 
              :size="16" 
              :class="[`ml-1 transition-transform`, isMessagesOpen ? 'rotate-180' : '']"
            />
          </button>
          <Button 
            type="button"
            variant="secondary"
            class="ml-auto"
          >
          Chat About {{ topic.slice(0, 10) }}
          <MessageCircleMore :size="16" class=""/>
          </Button>
        </div>
        <MessageList :is-messages-open="isMessagesOpen" :messages="messages" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick, computed } from 'vue'
import { X, Plus, ChevronDown, MessageCircleMore } from 'lucide-vue-next'
import { applicationState } from '@/app'
import Label from '@/core/design/label.vue'
import { id, type ThreadsState } from '@/plugins/threads/state';
import { useSelector } from '@xstate/vue'
import Button from '@/core/design/button.vue'
import MessageList from './message-list.vue'

const actor: ThreadsState = applicationState.system.get(id);
// Access view properties directly from state context
const messages = useSelector(actor, (state) => state.context.view.messages || []);
const relatedThreads = useSelector(actor, (state) => state.context.view.relatedThreads || []);
const tags = useSelector(actor, (state) => state.context.view.tags || []);
const topic = useSelector(actor, (state) => state.context.view.topic || '');
const type = useSelector(actor, (state) => state.context.view.threadType || 'work-item');
const instructions = ref('placeholder instructions');

// const isSaving = ref('')
const isMessagesOpen = ref(false)

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

type attrKeys = 'topic' | 'threadType'
const updateField = (key: attrKeys, element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
  const value = element.value;
  actor.send({ type: 'UPDATE_VIEW_DATA', key, value });
}
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