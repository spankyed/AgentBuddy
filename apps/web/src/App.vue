<template>
  <div class="flex flex-col h-screen">
    <div class="flex flex-grow overflow-hidden">
      <!-- Left Toolbar -->
      <Toolbar 
        :plugins="plugins"
        :active-plugin="activePlugin"
        @select-plugin="(id: string) => send({ type: 'SELECT_PLUGIN', pluginId: id })"
      />
      
      <!-- Main Area -->
      <div class="flex flex-col flex-grow overflow-hidden">
        <!-- Canvas Area -->
        <CanvasArea
          @crumb-click="(target: string) => send({ type: 'TRAIL_CLICK', target })"
          @canvas-toggle="send({ type: 'DEFAULT_TOGGLE', area: 'canvas' })"
          :breadcrumbs="breadcrumbs"
          :label="`${toggles.canvas ? defaultPlugin.label : activePlugin.label} Canvas`">
          <Router v-if="toggles.canvas" :views="defaultPlugin.canvas" :target="targetView" />
          <Router v-else :views="activePlugin.canvas" :target="targetView" />
        </CanvasArea>

        <!-- Chat Area -->
        <ChatArea>
          <component :is="defaultPlugin.chat" />
        </ChatArea>
      </div>
      
      <!-- Context Panel -->
      <InspectionPanel 
        @panel-toggle="send({ type: 'DEFAULT_TOGGLE', area: 'panel' })"
        :label="`${toggles.panel ? defaultPlugin.label : activePlugin.label} Inspection`">
        <component v-if="toggles.panel" :is="defaultPlugin.panel" />
        <component v-else :is="activePlugin.panel" />
      </InspectionPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSelector } from '@xstate/vue'
import Toolbar from '@/shared/layout/toolbar.vue'
import CanvasArea from '@/shared/layout/canvas-area.vue'
import ChatArea from '@/shared/layout/chat-area.vue'
import InspectionPanel from '@/shared/layout/inspection-panel.vue'
import { applicationState } from '@/app'
import Router from '@/shared/layout/router.vue'

const send = applicationState.send

const activePlugin = useSelector(applicationState, (state) => state.context.activePlugin)
const defaultPlugin = useSelector(applicationState, (state) => state.context.defaultPlugin)
const toggles = useSelector(applicationState, (state) => state.context.defaultToggles)
const plugins = useSelector(applicationState, (state) => state.context.plugins)
const breadcrumbs = useSelector(applicationState, (state) => state.context.breadcrumbs)
const targetView = useSelector(applicationState, (state) => state.context.targetView)
</script>

<style lang="scss" module>
</style> 