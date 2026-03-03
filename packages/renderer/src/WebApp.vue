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
    <div class="flex flex-grow overflow-hidden">
        <div class="flex flex-col flex-grow overflow-hidden" :style="{ width: panelSizes.inspectionWidth > 0 ? `calc(100% - ${panelSizes.inspectionWidth}px)` : '100%' }">
            <!-- Canvas Area -->
            <CanvasArea
            data-onboarding-id="canvas-area"
            @crumb-click="(target: string) => send({ type: 'TRAIL_CLICK', target })"
            @canvas-toggle="send({ type: 'DEFAULT_TOGGLE', area: 'canvas' })"
            @menu-action="handleMenuAction"
            :style="{ height: `${panelSizes.canvasHeight}%` }"
            :breadcrumbs="breadcrumbs"
            :menu-items="allMenuItems"
            :label="`${toggles.canvas ? defaultPlugin.label : activePlugin.label} Canvas`"
            :header-class="toggles.canvas ? defaultPlugin.options?.headerClass : activePlugin.options?.headerClass">
            <Router v-if="toggles.canvas" :views="defaultPlugin.canvas" :target="targetView" />
            <Router v-else :views="activePlugin.canvas" :target="targetView" />
            </CanvasArea>

            <!-- Vertical Resizer -->
            <PanelResizer
                orientation="vertical"
                @resize="handleCanvasResize"
                @double-click="handleCanvasDoubleClick"
            />

            <!-- Chat Area -->
            <ChatArea data-onboarding-id="chat-area" :style="{ height: `calc(${100 - panelSizes.canvasHeight}% - 4px)` }">
            <component :is="defaultPlugin.chat" />
            </ChatArea>
        </div>
        
        <!-- Horizontal Resizer -->
        <PanelResizer
            orientation="horizontal"
            @resize="handleInspectionResize"
            @double-click="handleInspectionDoubleClick"
        />
        
        <!-- Context Panel -->
        <InspectionPanel 
            v-if="panelSizes.inspectionWidth > 0"
            data-onboarding-id="inspection-panel"
            @panel-toggle="send({ type: 'DEFAULT_TOGGLE', area: 'panel' })"
            :style="{ width: `${panelSizes.inspectionWidth}px` }"
            :label="`${toggles.panel ? defaultPlugin.label : activePlugin.label} Inspection`">
            <component v-if="toggles.panel" :is="defaultPlugin.panel" />
            <component v-else-if="activePlugin.panel" :is="activePlugin.panel" />
            <component v-else :is="defaultPlugin.panel" />
        </InspectionPanel>
    </div>
    </div>
</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSelector } from '@xstate/vue'
import { Settings as SettingsIcon, PanelRight } from 'lucide-vue-next'
import Toolbar from '@/core/components/layout/toolbar.vue'
import CanvasArea from '@/core/components/layout/canvas-area.vue'
import ChatArea from '@/core/components/layout/chat-area.vue'
import InspectionPanel from '@/core/components/layout/inspection-panel.vue'
import PanelResizer from '@/core/components/layout/panel-resizer.vue'
import { applicationState } from '@/main'
import Router from '@/core/components/layout/router.vue'
import type { ContextMenuItem } from '@/core/context-menu'

const send = applicationState.send

const activePlugin = useSelector(applicationState, (state) => state.context.activePlugin)
const defaultPlugin = useSelector(applicationState, (state) => state.context.defaultPlugin)
const toggles = useSelector(applicationState, (state) => state.context.defaultToggles)
const plugins = useSelector(applicationState, (state) => state.context.visiblePlugins) // Use visible plugins
const breadcrumbs = useSelector(applicationState, (state) => state.context.breadcrumbs)
const contextMenuItems = useSelector(applicationState, (state) => state.context.contextMenuItems)
const targetView = useSelector(applicationState, (state) => state.context.targetView)
const panelSizes = useSelector(applicationState, (state) => state.context.panelSizes)

const currentPluginId = computed(() =>
  toggles.value.canvas ? defaultPlugin.value.id : activePlugin.value.id
)

const isPanelOpen = computed(() => panelSizes.value.inspectionWidth > 0)

const allMenuItems = computed<ContextMenuItem[]>(() => {
  const pluginItems = contextMenuItems.value

  const defaultItems: ContextMenuItem[] = [
    {
      label: 'Settings',
      icon: SettingsIcon,
      event: { type: 'APP_OPEN_PLUGIN_SETTINGS', pluginId: currentPluginId.value },
      separator: pluginItems.length > 0,
    },
    {
      label: 'Context Panel',
      icon: PanelRight,
      event: { type: 'APP_TOGGLE_INSPECTION_PANEL' },
      isActive: isPanelOpen.value,
    },
  ]

  return [...pluginItems, ...defaultItems]
})

const handleMenuAction = (event: { type: string; [key: string]: any }) => {
  if (event.type === 'APP_TOGGLE_INSPECTION_PANEL') {
    send({ type: 'TOGGLE_INSPECTION_PANEL' })
    return
  }

  if (event.type === 'APP_OPEN_PLUGIN_SETTINGS') {
    send({ type: 'SELECT_PLUGIN', pluginId: 'settings' })
    const settingsActor = applicationState.system.get('settings')
    if (settingsActor) {
      settingsActor.send({ type: 'TAB.SELECT', tab: 'plugins' })
      settingsActor.send({ type: 'PLUGIN.SELECT', pluginId: event.pluginId })
    }
    return
  }

  const pluginId = toggles.value.canvas ? defaultPlugin.value.id : activePlugin.value.id
  applicationState.system.get(pluginId).send(event)
}

const handleCanvasResize = (delta: number) => {
  const mainAreaHeight = window.innerHeight - 50; // Approximate, accounting for toolbar
  const currentHeightPx = (panelSizes.value.canvasHeight / 100) * mainAreaHeight;
  const newHeightPx = currentHeightPx + delta;
  const newHeightPercent = (newHeightPx / mainAreaHeight) * 100;
  
  send({ type: 'RESIZE_PANEL', panel: 'canvas', size: newHeightPercent });
}

const handleInspectionResize = (delta: number) => {
  const newWidth = panelSizes.value.inspectionWidth - delta; // Negative because we're dragging from left side
  send({ type: 'RESIZE_PANEL', panel: 'inspection', size: newWidth });
}

const handleCanvasDoubleClick = () => {
  // Toggle between collapsed (thread bar only) and default (50/50)
  const isCollapsed = panelSizes.value.canvasHeight >= 93;
  send({ type: 'RESIZE_PANEL', panel: 'canvas', size: isCollapsed ? 50 : 95 });
}

const handleInspectionDoubleClick = () => {
  // Toggle inspection panel between collapsed and default
  send({ type: 'TOGGLE_INSPECTION_PANEL' });
}
</script>

<style lang="scss" module>
</style> 