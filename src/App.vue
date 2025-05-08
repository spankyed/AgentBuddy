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
          @crumb-click="(target: string) => send({ type: 'ROUTE_CLICK', target })"
          @canvas-toggle="send({ type: 'DEFAULT_TOGGLE', area: 'canvas' })"
          :breadcrumbs="breadcrumbs"
          :label="`${toggles.canvas ? defaultPlugin.label : activePlugin.label} Canvas`">
          <component v-if="toggles.canvas" :is="defaultPlugin.canvas" />
          <!-- <component v-else :is="activePlugin.canvas" /> -->
          <Router v-else :views="activePlugin.canvas" :route="routeTarget" />
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
import Toolbar from '@/components/layout/toolbar.vue'
import CanvasArea from '@/components/layout/canvas-area.vue'
import ChatArea from '@/components/layout/chat-area.vue'
import InspectionPanel from '@/components/layout/inspection-panel.vue'
import { applicationActor } from '@/application'
import type { ActionItem } from '@/helpers/types'
import type { Plugin } from '@/plugins'
import Router from '@/components/layout/router.vue'

const send = applicationActor.send

const activePlugin = useSelector(applicationActor, (state) => state.context.activePlugin)
const defaultPlugin = useSelector(applicationActor, (state) => state.context.defaultPlugin)
const toggles = useSelector(applicationActor, (state) => state.context.defaultToggles)
const plugins = useSelector(applicationActor, (state) => state.context.plugins)
const breadcrumbs = useSelector(applicationActor, (state) => state.context.breadcrumbs as Crumb[])
const routeTarget = useSelector(applicationActor, (state) => state.context.routeTarget)
</script>

<style lang="scss" module>
</style> 