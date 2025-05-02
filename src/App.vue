<template>
  <div class="flex flex-col h-screen">
    <div class="flex flex-grow overflow-hidden">
      <!-- Left Toolbar -->
      <Toolbar 
        :active-item="activeToolbarItem"
        @select-item="handleSelectToolbarItem"
      />
      
      <!-- Main Content Area -->
      <div class="flex flex-col flex-grow overflow-hidden">
        <!-- Canvas Area -->
        <CanvasArea :content="canvasContent" />

        <!-- Chat Area -->
        <ChatArea 
          :messages="messages"
          @send-message="handleSendMessage"
        />
      </div>
      
      <!-- Context Panel -->
      <ContextPanel :items="contextItems" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSelector } from '@xstate/vue'
import Toolbar from './components/Toolbar.vue'
import CanvasArea from './components/Canvas.vue'
import ChatArea from './components/chat/Chat.vue'
import ContextPanel from './components/context/Panel.vue'
import { applicationActor } from './state/application'
import type { ActionItem } from './helpers/types'

// Get state from the machine
const activeToolbarItem = useSelector(applicationActor, (state) => state.context.activeToolbarItem)
const messages = useSelector(applicationActor, (state) => state.context.messages)
const canvasContent = useSelector(applicationActor, (state) => state.context.canvasContent)
const contextItems = useSelector(applicationActor, (state) => state.context.contextItems)

// Get the send function from the actor
const send = applicationActor.send

const handleSelectToolbarItem = (itemId: string) => {
  send({ type: 'SELECT_TOOLBAR_ITEM', itemId } as const)
}

const handleSendMessage = (content: string) => {
  send({ type: 'SEND_MESSAGE', content } as const)
  
  // Simulate a new action
  const newAction: ActionItem = {
    id: Date.now().toString(),
    description: 'Processing your request...',
    status: 'in-progress',
    timestamp: new Date()
  }
  
  send({ 
    type: 'ADD_ACTION', 
    action: newAction
  } as const)
}
</script>

<style scoped>
/* Add any component-specific styles here */
</style> 