<template>
<div class="flex flex-col h-screen">
    <ToastNotification ref="toast" />
    <div class="flex flex-grow overflow-hidden">
    <!-- Left Toolbar (hidden during onboarding) -->
    <Toolbar
        v-if="!isOnboarding"
        :plugins="plugins"
        :active-plugin="activePlugin"
        @select-plugin="(id: string) => send({ type: 'SELECT_PLUGIN', pluginId: id })"
    />

    <!-- Main Area -->
    <div class="flex flex-grow overflow-hidden" :style="{ paddingRight: canShowPanel && panelSizes.inspectionWidth === 0 ? '2px' : '0' }">
        <div class="flex flex-col flex-grow overflow-hidden" :style="{ minWidth: '350px', width: canShowPanel && panelSizes.inspectionWidth > 0 ? `calc(100% - ${panelSizes.inspectionWidth}px)` : '100%' }">
            <!-- Canvas Area — always rendered; collapses to just its header when chat is maximized -->
            <!-- Canvas Area — empty draggable header during onboarding, normal otherwise -->
            <CanvasArea
            data-onboarding-id="canvas-area"
            :header-only="isOnboarding || chatMaximized"
            @crumb-click="(target: string, info?: any) => send({ type: 'TRAIL_CLICK', target, info })"
            @canvas-toggle="send({ type: 'DEFAULT_TOGGLE', area: 'canvas' })"
            @menu-action="handleMenuAction"
            :style="isOnboarding || chatMaximized
                ? { flex: '0 0 auto', height: 'auto' }
                : { height: `${panelSizes.canvasHeight}%` }"
            :breadcrumbs="isOnboarding ? [] : breadcrumbs"
            :menu-items="isOnboarding ? [] : allMenuItems"
            :label="`${toggles.canvas ? defaultPlugin.label : activePlugin.label} Canvas`"
            :header-class="toggles.canvas ? defaultPlugin.options?.headerClass : activePlugin.options?.headerClass">
            <Router v-if="toggles.canvas" :views="defaultPlugin.canvas" :target="targetView" />
            <Router v-else :views="activePlugin.canvas" :target="targetView" />
            </CanvasArea>

            <!-- Vertical Resizer (hidden during onboarding) -->
            <PanelResizer
                v-if="!isOnboarding"
                orientation="vertical"
                :collapsed="chatMaximized || panelSizes.canvasHeight >= 93"
                @resize="handleCanvasResize"
                @click="handleCanvasClick"
                @right-click="chatMaximized ? handleChatRestore() : handleChatMaximize()"
            />

            <!-- Chat Area — fills remaining space below the canvas header when maximized -->
            <ChatArea
                data-onboarding-id="chat-area"
                class="relative"
                :style="isOnboarding || chatMaximized
                    ? { flex: '1 1 0%', minHeight: 0 }
                    : { height: `calc(${100 - panelSizes.canvasHeight}% - 4px)` }"
            >
                <component :is="defaultPlugin.chat" />
            </ChatArea>
        </div>

        <!-- Horizontal Resizer (hidden during onboarding) -->
        <PanelResizer
            v-if="canShowPanel && !isOnboarding"
            orientation="horizontal"
            :collapsed="!isPanelOpen"
            @resize="handleInspectionResize"
            @click="handleInspectionClick"
        />

        <!-- Context Panel (hidden during onboarding) -->
        <InspectionPanel
            v-if="canShowPanel && panelSizes.inspectionWidth > 0 && !isOnboarding"
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
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { Settings as SettingsIcon, PanelRight, PanelTop, Terminal } from 'lucide-vue-next'
import Toolbar from '@/core/components/layout/toolbar.vue'
import CanvasArea from '@/core/components/layout/canvas-area.vue'
import ChatArea from '@/core/components/layout/chat-area.vue'
import InspectionPanel from '@/core/components/layout/inspection-panel.vue'
import PanelResizer from '@/core/components/layout/panel-resizer.vue'
import { applicationState } from '@/main'
import { navigateToPlugin } from '@/core/utils/navigate'
import Router from '@/core/components/layout/router.vue'
import BrainInspectPanel from '@/plugins/brain/panel.vue'
import type { ContextMenuItem } from '@/core/context-menu'
import ToastNotification from '@/core/components/design/ToastNotification.vue'
import { registerGlobalToast } from '@/core/toast'

const send = applicationState.send
const toast = ref<InstanceType<typeof ToastNotification> | null>(null)

onMounted(() => registerGlobalToast(toast.value))
onUnmounted(() => registerGlobalToast(null))

const activePlugin = useSelector(applicationState, (state) => state.context.activePlugin)
const defaultPlugin = useSelector(applicationState, (state) => state.context.defaultPlugin)
const toggles = useSelector(applicationState, (state) => state.context.defaultToggles)
const plugins = useSelector(applicationState, (state) => state.context.visiblePlugins) // Use visible plugins
const breadcrumbs = useSelector(applicationState, (state) => state.context.breadcrumbs)
const contextMenuItems = useSelector(applicationState, (state) => state.context.contextMenuItems)
const targetView = useSelector(applicationState, (state) => state.context.targetView)
const panelSizes = useSelector(applicationState, (state) => state.context.panelSizes)
const chatMaximized = useSelector(applicationState, (state) => state.context.panelSizes.chatMaximized ?? false)
const isOnboarding = useSelector(applicationState, (s) => s.hasTag('onboarding'))

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
    navigateToPlugin('settings', [
      { type: 'TAB.SELECT', tab: 'plugins' },
      { type: 'PLUGIN.SELECT', pluginId: event.pluginId }
    ])
    return
  }

  const pluginId = toggles.value.canvas ? defaultPlugin.value.id : activePlugin.value.id
  applicationState.system.get(pluginId).send(event)
}

const MIN_CHAT_HEIGHT = 180 // px — enough for chat input to remain visible

const getMainAreaHeight = () => window.innerHeight - 50 // Approximate, accounting for toolbar

// Guard so drag-to-restore only fires once per maximized drag
let maxRestored = false

const handleCanvasResize = (delta: number) => {
  if (chatMaximized.value) {
    if (!maxRestored) { maxRestored = true; handleChatRestore(true) }
    return
  }
  maxRestored = false
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
  if (chatMaximized.value) { handleChatRestore(); return }
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
