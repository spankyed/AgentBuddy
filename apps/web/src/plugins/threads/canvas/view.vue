<template>
  <div class="max-w-5xl px-6 py-4 mx-auto space-y-6 root-container">
    <div class="p-4 space-y-6">
      <!-- Topic & Status -->
      <div class="flex flex-col gap-4 md:flex-row">
        <div class="flex-1">
          <Label>Topic</Label>
          <input
            :value="topic"
            @input="e => updateField('topic', e.target as HTMLInputElement)"
            type="text"
            :placeholder="placeholder"
            class="w-full px-3 py-2 text-sm rounded bg-neutral-900 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
          />
        </div>
        <div class="w-full md:w-40">
          <Label>Type</Label>
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
          <p class="text-sm italic text-neutral-300">please use css variables from our design systems to remove hardcoded colors</p>
        </div>
      </div>

      <!-- Notes -->
      <div>
        <button 
          @click="isNotesOpen = !isNotesOpen"
          class="flex items-center justify-between px-2 py-0.5 text-sm font-medium rounded text-neutral-300 hover:bg-neutral-700"
        >
          <span>Add Notes</span>
          <ChevronDown 
            :size="16" 
            :class="[`ml-1 transition-transform`, isNotesOpen ? 'rotate-180' : '']"
          />
        </button>

        <div v-if="isNotesOpen" class="p-3 mt-2 rounded-sm bg-neutral-900">
          <textarea
            :value="notes"
            @input="e => updateField('notes', e.target as HTMLTextAreaElement)"
            class="w-full h-64 p-2 text-sm rounded bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-primary-600 resize-handle"
            placeholder="Add thread notes here..."
          ></textarea>
        </div>
      </div>

      <!-- Threads list -->
      <div>
        <Label>Related Threads</Label>
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
            v-for="(thread, index) in threads"
            :key="index"
            class="cursor-pointer inline-flex items-center pl-3 py-0.5 text-sm bg-neutral-900/60 text-neutral-200 rounded"
          >
            {{ thread }}
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
        <Label>Tags</Label>
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
            {{ tag }}
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
      <div class="mt-6">
        <div class="flex gap-2">
          <button 
            @click="isMessagesOpen = !isMessagesOpen"
            class="flex items-center justify-between px-2 py-0.5 text-sm font-medium rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
          >
            <span>View Messages ({{ messages.length }})</span>
            <ChevronDown 
              :size="16" 
              :class="[`ml-1 transition-transform`, isMessagesOpen ? 'rotate-180' : '']"
            />
          </button>
          <button 
            class="ml-auto text-sm font-medium underline text-neutral-100 hover:text-white"
          >
            Continue to chat
          </button>
        </div>
        <div v-if="isMessagesOpen" class="p-3 pr-0 mt-2 overflow-hidden rounded-sm bg-neutral-900">
          <div class="overflow-y-auto max-h-96 messages-container">
            <ul class="mr-2 space-y-1">
              <li v-for="(message, index) in messages" :key="index" 
                  :class="[
                    'px-3 py-2 text-sm truncate rounded-sm',
                    message.sender === 'user' ? 'bg-neutral-800 text-neutral-200' : 'bg-neutral-900 text-neutral-300'
                  ]">
                {{ message.content }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick, computed } from 'vue'
import { X, Plus, ChevronDown } from 'lucide-vue-next'
import { applicationState } from '@/app'
import Label from '@/core/design/label.vue'
import { id, type ThreadsState } from '@/plugins/threads/state';
import type { ThreadEntity } from '@abuddy/api';
import { useSelector } from '@xstate/vue'

const actor: ThreadsState = applicationState.system.get(id);
// Access view properties directly from state context
const messages = useSelector(actor, (state) => state.context.view.messages || []);
const relatedThreads = useSelector(actor, (state) => state.context.view.relatedThreads || []);
const tags = useSelector(actor, (state) => state.context.view.tags || []);
const topic = useSelector(actor, (state) => state.context.view.topic || '');
const type = useSelector(actor, (state) => state.context.view.threadType || 'work-item');


// Placeholder options for topic based on selected type
const workItemPlaceholders = [
  'Review latest PR for UX improvements',
  'Tackle sprint tasks for Q2',
  'Implement dev feedback for bug fixes'
]
const projectPlaceholders = [
  'Q3 marketing campaign',
  'Upcoming project milestones',
  'Settings page redesign',
]
const placeholder = ref('')
const setRandomPlaceholder = () => {
  const list = type.value === 'work-item'
    ? workItemPlaceholders
    : projectPlaceholders
  placeholder.value = list[Math.floor(Math.random() * list.length)]
}

const threads = ref<string[]>(relatedThreads.value || [])
// const isSaving = ref('')
const isMessagesOpen = ref(false)
const isNotesOpen = ref(false)
const notes = ref('')

onMounted(() => setRandomPlaceholder())
watch(type, () => setRandomPlaceholder())
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

type attrKeys = 'topic' | 'threadType' | 'notes' | 'tags' | 'relatedThreads'
const updateField = (key: attrKeys, element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
  const value = element.value;
  actor.send({ type: 'UPDATE_THREAD_DATA', key, value });
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