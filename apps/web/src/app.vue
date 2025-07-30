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
        <div class="flex flex-col flex-grow overflow-hidden" :style="{ width: panelSizes.inspectionWidth > 0 ? `calc(100% - ${panelSizes.inspectionWidth}px - 4px)` : 'calc(100% - 4px)' }">
            <!-- Canvas Area -->
            <CanvasArea
            @crumb-click="(target: string) => send({ type: 'TRAIL_CLICK', target })"
            @canvas-toggle="send({ type: 'DEFAULT_TOGGLE', area: 'canvas' })"
            :style="{ height: `${panelSizes.canvasHeight}%` }"
            :breadcrumbs="breadcrumbs"
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
            <ChatArea :style="{ height: `calc(${100 - panelSizes.canvasHeight}% - 4px)` }">
            <component :is="defaultPlugin.chat" />
            </ChatArea>
        </div>
        
        <!-- Horizontal Resizer (always visible) -->
        <PanelResizer
            orientation="horizontal"
            @resize="handleInspectionResize"
            @double-click="handleInspectionDoubleClick"
        />
        
        <!-- Context Panel -->
        <InspectionPanel 
            v-if="panelSizes.inspectionWidth > 0"
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
import { useSelector } from '@xstate/vue'
import Toolbar from '@/core/layout/toolbar.vue'
import CanvasArea from '@/core/layout/canvas-area.vue'
import ChatArea from '@/core/layout/chat-area.vue'
import InspectionPanel from '@/core/layout/inspection-panel.vue'
import PanelResizer from '@/core/layout/panel-resizer.vue'
import { applicationState } from '@/app'
import Router from '@/core/layout/router.vue'

const send = applicationState.send

const activePlugin = useSelector(applicationState, (state) => state.context.activePlugin)
const defaultPlugin = useSelector(applicationState, (state) => state.context.defaultPlugin)
const toggles = useSelector(applicationState, (state) => state.context.defaultToggles)
const plugins = useSelector(applicationState, (state) => state.context.plugins)
const breadcrumbs = useSelector(applicationState, (state) => state.context.breadcrumbs)
const targetView = useSelector(applicationState, (state) => state.context.targetView)
const panelSizes = useSelector(applicationState, (state) => state.context.panelSizes)

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
  // Toggle between collapsed (80%) and default (50%)
  const isCollapsed = panelSizes.value.canvasHeight >= 80;
  send({ type: 'RESIZE_PANEL', panel: 'canvas', size: isCollapsed ? 50 : 80 });
}

const handleInspectionDoubleClick = () => {
  // Toggle inspection panel between collapsed and default
  send({ type: 'TOGGLE_INSPECTION_PANEL' });
}
</script>

<style lang="scss" module>
</style> 