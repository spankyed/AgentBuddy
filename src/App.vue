<template>
  <div class="flex flex-col h-screen">
    <div class="flex flex-grow overflow-hidden">
      <!-- Left Toolbar -->
      <Toolbar 
        :plugins="plugins"
        :active-plugin="activePlugin"
        @select-plugin="send({ type: 'SELECT_PLUGIN', pluginId })"
      />
      
      <!-- Main Content Area -->
      <div class="flex flex-col flex-grow overflow-hidden">
        <!-- Canvas Area -->
        <CanvasArea
          @canvas-toggle="send({ type: 'CANVAS_TOGGLE' })"
          :label="toggles.canvas ? 'Agent Canvas' : activePlugin.label">
          <component v-if="toggles.canvas" :is="defaultPlugin.canvas" />
          <component v-else :is="activePlugin.canvas" />
        </CanvasArea>

        <!-- Chat Area -->
        <ChatArea 
          :messages="messages"
          @send-message="handleSendMessage"
          @new-thread="handleNewThread"
        />
        <!-- <ChatArea>
          <component :is="defaultPlugin.chat" />
        </ChatArea> -->
      </div>
      
      <!-- Context Panel -->
      <ContextPanel 
        @panel-toggle="send({ type: 'PANEL_TOGGLE' })"
        :label="`${toggles.panel ? defaultPlugin.label : activePlugin.label} Inspection`">
        <component v-if="toggles.panel" :is="defaultPlugin.panel" />
        <component v-else :is="activePlugin.panel" />
      </ContextPanel>
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
import type { Plugin } from './plugins'

const send = applicationActor.send

const activePlugin = useSelector(applicationActor, (state) => state.context.activePlugin)
const defaultPlugin = useSelector(applicationActor, (state) => state.context.defaultPlugin)
const toggles = useSelector(applicationActor, (state) => state.context.agentToggles)
const plugins = useSelector(applicationActor, (state) => state.context.plugins)

const messages = useSelector(applicationActor, (state) => state.context.messages)
</script>

<style lang="scss" module>
</style> 