<template>
  <div class="flex flex-col h-screen">
    <!-- Header with Action Buttons -->
    <div class="flex items-center justify-between p-3 border-b shadow-sm bg-neutral-900 border-neutral-800">
      <div class="flex items-center space-x-3">
        <button 
          v-for="action in mockActions.slice(0, 6)"
          :key="action.id"
          class="py-1.5 px-3 text-sm font-medium bg-neutral-800 rounded-full hover:bg-neutral-900 transition-colors"
        >
          {{ action.description }}
        </button>
      </div>
    </div>
    
    <div class="flex flex-grow overflow-hidden">
      <!-- Left Toolbar -->
      <Toolbar 
        :active-item="activeToolbarItem"
      />
      <!-- <Toolbar 
        :active-item="activeToolbarItem"
        @select-item="setActiveToolbarItem"
      /> -->
      
      <!-- Main Content Area -->
      <div class="flex flex-col flex-grow overflow-hidden">
        <!-- Canvas Area -->
        <CanvasArea :content="mockCanvasContent" />
        
        <!-- Chat Area -->
        <ChatArea 
          :messages="messages"
          @send-message="handleSendMessage"
        />
        
        <!-- Action Queue -->
        <!-- <ActionQueue 
          :actions="actions"
          @clear="handleClearCompletedActions"
        /> -->
      </div>
      
      <!-- Context Panel -->
      <ContextPanel :items="mockContextItems" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Toolbar from './core/Toolbar.vue'
import CanvasArea from './core/CanvasArea.vue'
import ChatArea from './core/ChatArea.vue'
import ContextPanel from './core/ContextPanel.vue'
// import ActionQueue from './core/ActionQueue.vue'
import type { Message, ActionItem } from './core/types/index'
import { mockMessages, mockActions, mockContextItems, mockCanvasContent } from './core/data/mockData.ts'
// import { Sun, Moon } from 'lucide-vue-next'

const messages = ref<Message[]>(mockMessages)
const actions = ref<ActionItem[]>(mockActions)
const activeToolbarItem = ref('code')

const handleSendMessage = (content: string) => {
  const newMessage: Message = {
    id: Date.now().toString(),
    content,
    role: 'user',
    timestamp: new Date()
  }
  
  messages.value.push(newMessage)
  
  // Simulate a new action
  const newAction: ActionItem = {
    id: Date.now().toString(),
    description: 'Processing your request...',
    status: 'in-progress',
    timestamp: new Date()
  }
  
  actions.value.push(newAction)
  
  // Simulate assistant response after a short delay
  setTimeout(() => {
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      content: "I'm analyzing your request to rewrite the code with CSS variables. Give me a moment to prepare a response.",
      role: 'assistant',
      timestamp: new Date()
    }
    
    messages.value.push(assistantMessage)
    
    // Update the action status
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    // actions.value = actions.value.map((action: { id: any }) => 
    //   action.id === newAction.id 
    //     ? { ...action, status: 'completed', description: 'Analyzed code structure' } 
    //     : action
    // )
  }, 1000)
}

// const handleClearCompletedActions = () => {
//   actions.value = actions.value.filter(a => a.status !== 'completed')
// }
</script>

<style scoped>
/* Add any component-specific styles here */
</style> 