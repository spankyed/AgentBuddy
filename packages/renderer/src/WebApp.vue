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
    <div class="flex flex-grow overflow-hidden" :style="{ paddingRight: canShowPanel && panelSizes.inspectionWidth === 0 ? '2px' : '0' }">
        <div class="flex flex-col flex-grow overflow-hidden" :style="{ minWidth: '350px', width: canShowPanel && panelSizes.inspectionWidth > 0 ? `calc(100% - ${panelSizes.inspectionWidth}px)` : '100%' }">
            <!-- Canvas Area — always rendered; collapses to just its header when chat is maximized -->
            <CanvasArea
            data-onboarding-id="canvas-area"
            :header-only="chatMaximized"
            @crumb-click="(target: string, info?: any) => send({ type: 'TRAIL_CLICK', target, info })"
            @canvas-toggle="send({ type: 'DEFAULT_TOGGLE', area: 'canvas' })"
            @menu-action="handleMenuAction"
            :style="chatMaximized
                ? { flex: '0 0 auto', height: 'auto' }
                : { height: `${panelSizes.canvasHeight}%` }"
            :breadcrumbs="breadcrumbs"
            :menu-items="allMenuItems"
            :label="`${toggles.canvas ? defaultPlugin.label : activePlugin.label} Canvas`"
            :header-class="toggles.canvas ? defaultPlugin.options?.headerClass : activePlugin.options?.headerClass">
            <Router v-if="toggles.canvas" :views="defaultPlugin.canvas" :target="targetView" />
            <Router v-else :views="activePlugin.canvas" :target="targetView" />
            </CanvasArea>

            <!-- Vertical Resizer (hidden while chat is maximized) -->
            <PanelResizer
                v-if="!chatMaximized"
                orientation="vertical"
                :collapsed="panelSizes.canvasHeight >= 93"
                style="background-color: rgb(28 28 28)"
                @resize="handleCanvasResize"
                @click="handleCanvasClick"
                @right-click="handleChatMaximize"
            />

            <!-- Chat Area — fills remaining space below the canvas header when maximized -->
            <ChatArea
                data-onboarding-id="chat-area"
                class="relative"
                :style="chatMaximized
                    ? { flex: '1 1 0%', minHeight: 0 }
                    : { height: `calc(${100 - panelSizes.canvasHeight}% - 4px)` }"
            >
                <!-- Floating restore handle: hover-revealed bar at the top of the
                     maximized chat. Matches the original vertical PanelResizer's 7px
                     hover zone, but extended *downward* into the chat (the original
                     straddles the border with 4px above + 3px at border; here "above"
                     would be outside the chat/window, so we put the full 7px inside). -->
                <div
                    v-if="chatMaximized"
                    class="group absolute top-0 left-0 right-0 h-2 z-20 cursor-row-resize"
                    title="Click to restore chat size"
                    @mousedown.prevent="startMaxDrag"
                    @contextmenu.prevent="() => handleChatRestore()"
                >
                    <div class="absolute top-0 left-0 right-0 h-[7px] bg-transparent group-hover:bg-blue-500/50 transition-colors" />
                </div>

                <component :is="defaultPlugin.chat" />
            </ChatArea>
        </div>

        <!-- Horizontal Resizer -->
        <PanelResizer
            v-if="canShowPanel"
            orientation="horizontal"
            :collapsed="!isPanelOpen"
            @resize="handleInspectionResize"
            @click="handleInspectionClick"
        />

        <!-- Context Panel -->
        <InspectionPanel
            v-if="canShowPanel && panelSizes.inspectionWidth > 0"
            data-onboarding-id="inspection-panel"
:style="{ width: `${panelSizes.inspectionWidth}px` }"
            :label="`${activePlugin.panel ? activePlugin.label : 'Brain'} Inspection`">
            <component v-if="activePlugin.panel" :is="activePlugin.panel" />
            <BrainInspectPanel v-else-if="inspectMode" />
        </InspectionPanel>
    </div>
    </div>
</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSelector } from '@xstate/vue'
import { Settings as SettingsIcon, PanelRight, PanelTop, Terminal } from 'lucide-vue-next'
import Toolbar from '@/core/components/layout/toolbar.vue'
import CanvasArea from '@/core/components/layout/canvas-area.vue'
import ChatArea from '@/core/components/layout/chat-area.vue'
import InspectionPanel from '@/core/components/layout/inspection-panel.vue'
import PanelResizer from '@/core/components/layout/panel-resizer.vue'
import { applicationState } from '@/main'
import Router from '@/core/components/layout/router.vue'
import BrainInspectPanel from '@/plugins/brain/panel.vue'
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
const chatMaximized = useSelector(applicationState, (state) => state.context.panelSizes.chatMaximized ?? false)

const brainActor = applicationState.system.get('brain')
const inspectMode = useSelector(brainActor, (state: any) =>
  state.context.inspectEnabled ?? false
)

const currentPluginId = computed(() =>
  toggles.value.canvas ? defaultPlugin.value.id : activePlugin.value.id
)

const canShowPanel = computed(() => inspectMode.value || !!activePlugin.value.panel)
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
      label: 'Show Canvas',
      icon: PanelTop,
      event: { type: 'APP_TOGGLE_CANVAS' },
      isActive: !chatMaximized.value,
    },
    ...(canShowPanel.value ? [{
      label: 'Context Panel',
      icon: PanelRight,
      event: { type: 'APP_TOGGLE_INSPECTION_PANEL' },
      isActive: isPanelOpen.value,
    }] : []),
    {
      label: 'Inspect Mode',
      icon: Terminal,
      event: { type: 'APP_TOGGLE_INSPECT' },
      isActive: inspectMode.value,
    },
  ]

  return [...pluginItems, ...defaultItems]
})

const handleMenuAction = (event: { type: string; [key: string]: any }) => {
  if (event.type === 'APP_TOGGLE_CANVAS') {
    send({ type: chatMaximized.value ? 'RESTORE_CHAT' : 'MAXIMIZE_CHAT' })
    return
  }

  if (event.type === 'APP_TOGGLE_INSPECTION_PANEL') {
    send({ type: 'TOGGLE_INSPECTION_PANEL' })
    return
  }

  if (event.type === 'APP_COPY_TO_CLIPBOARD') {
    navigator.clipboard.writeText(event.text)
    return
  }

  if (event.type === 'APP_TOGGLE_INSPECT') {
    brainActor.send({ type: 'TOGGLE_INSPECT' })
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

const MIN_CHAT_HEIGHT = 180 // px — enough for chat input to remain visible
const MAX_DRAG_THRESHOLD = 3

const getMainAreaHeight = () => window.innerHeight - 50 // Approximate, accounting for toolbar

// --- Maximized-chat restore handle (click = restore, drag = restore at max chat height) ---
let maxDragStartY = 0
let dragged = false

const cleanupMaxDrag = () => {
  document.removeEventListener('mousemove', handleMaxDrag)
  document.removeEventListener('mouseup', stopMaxDrag)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

const startMaxDrag = (e: MouseEvent) => {
  if (e.button !== 0) return
  dragged = false
  maxDragStartY = e.clientY
  document.addEventListener('mousemove', handleMaxDrag)
  document.addEventListener('mouseup', stopMaxDrag)
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
}

const handleMaxDrag = (e: MouseEvent) => {
  if (Math.abs(e.clientY - maxDragStartY) < MAX_DRAG_THRESHOLD) return
  dragged = true
  cleanupMaxDrag()
  handleChatRestore(true)
}

const stopMaxDrag = () => {
  cleanupMaxDrag()
  if (!dragged) handleChatRestore()
}

const handleCanvasResize = (delta: number) => {
  const mainAreaHeight = getMainAreaHeight()
  const currentHeightPx = (panelSizes.value.canvasHeight / 100) * mainAreaHeight
  const newHeightPx = currentHeightPx + delta
  const maxCanvasPercent = ((mainAreaHeight - MIN_CHAT_HEIGHT) / mainAreaHeight) * 100
  const newHeightPercent = Math.min(maxCanvasPercent, (newHeightPx / mainAreaHeight) * 100)
  send({ type: 'RESIZE_PANEL', panel: 'canvas', size: newHeightPercent })
}

const handleInspectionResize = (delta: number) => {
  const newWidth = panelSizes.value.inspectionWidth - delta
  send({ type: 'RESIZE_PANEL', panel: 'inspection', size: newWidth })
}

const handleCanvasClick = () => {
  const isCollapsed = panelSizes.value.canvasHeight >= 93
  send({ type: 'RESIZE_PANEL', panel: 'canvas', size: isCollapsed ? 50 : 95 })
}

const handleChatMaximize = () => send({ type: 'MAXIMIZE_CHAT' })
const handleChatRestore = (maxChat = false) => {
  send({ type: 'RESTORE_CHAT' })
  if (maxChat) {
    const minCanvasPercent = (MIN_CHAT_HEIGHT / getMainAreaHeight()) * 100
    send({ type: 'RESIZE_PANEL', panel: 'canvas', size: minCanvasPercent })
  }
}

const handleInspectionClick = () => {
  // Toggle inspection panel between collapsed and default
  send({ type: 'TOGGLE_INSPECTION_PANEL' });
}
</script>

<style lang="scss" module>
</style>
