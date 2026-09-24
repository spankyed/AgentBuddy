<template>
<!-- data-active-plugin is the active plugin as rendered. Vue writes it in the same flush that swaps the
     canvas below, so a test can wait for a navigation to be on screen rather than sleep after it. -->
<div class="flex flex-col h-screen" :data-active-plugin="activePlugin.id">
    <ToastNotification ref="toast" />
    <div class="flex flex-grow overflow-hidden">
    <!-- Left Toolbar (hidden during onboarding) -->
    <Toolbar
        v-if="!isOnboarding"
        :plugins="plugins"
        :active-plugin="activePlugin"
        @select-plugin="(id: string) => send({ type: 'SELECT_PLUGIN', plugin: id })"
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
            <!-- Each plugin area renders as part of its plugin, which is what usePlugin() returns there -->
            <PluginScope :plugin="currentPluginId" :key="currentPluginId">
              <Router :views="toggles.canvas ? defaultPlugin.canvas : activePlugin.canvas" :target="targetView" />
            </PluginScope>
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
                <PluginScope :plugin="defaultPlugin.id" :key="defaultPlugin.id">
                  <component :is="defaultPlugin.chat" />
                </PluginScope>
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
            :label="`${activePlugin.panel ? activePlugin.label : fallbackPlugin?.label} Inspection`">
            <PluginScope v-if="activePlugin.panel" :plugin="activePlugin.id" :key="activePlugin.id">
              <component :is="activePlugin.panel" />
            </PluginScope>
            <PluginScope v-else-if="fallbackShown && fallbackPlugin" :plugin="fallbackPlugin.id" key="fallback-panel">
              <component :is="fallbackPlugin.panel" />
            </PluginScope>
        </InspectionPanel>
    </div>
    </div>
</div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useSelector } from '@xstate/vue'
import type { ActorRefFrom, AnyStateMachine } from 'xstate'
import { Settings as SettingsIcon, ExternalLink, PanelRight, PanelTop, Terminal } from 'lucide-vue-next'
import Toolbar from '@/views/layout/Toolbar.vue'
import CanvasArea from '@/views/layout/CanvasArea.vue'
import ChatArea from '@/views/layout/ChatArea.vue'
import InspectionPanel from '@/views/layout/InspectionPanel.vue'
import PanelResizer from '@abuddy/ui/layout/panel-resizer'
import { applicationState } from '@/main'
import { HOST, visiblePluginsOf } from '@abuddy/host/fe'
import { untypedOpenPlugin, PluginScope } from '@abuddy/sdk/fe'
import Router from '@/views/layout/PluginRouter.vue'
import type { ContextMenuItem } from '@abuddy/sdk/fe'
import ToastNotification from '@abuddy/ui/design/ToastNotification'
import { registerGlobalToast } from '@/adapters/toast'

const send = applicationState.send
const toast = ref<InstanceType<typeof ToastNotification> | null>(null)

onMounted(() => registerGlobalToast(toast.value))
onUnmounted(() => registerGlobalToast(null))

const activePlugin = useSelector(applicationState, (state) => state.context.activePlugin)
const defaultPlugin = useSelector(applicationState, (state) => state.context.defaultPlugin)
const toggles = useSelector(applicationState, (state) => state.context.defaultToggles)
const plugins = useSelector(applicationState, (state) => visiblePluginsOf(state.context))
const breadcrumbs = useSelector(applicationState, (state) => state.context.breadcrumbs)
const contextMenuItems = useSelector(applicationState, (state) => state.context.contextMenuItems)
const targetView = useSelector(applicationState, (state) => state.context.targetView)
const panelSizes = useSelector(applicationState, (state) => state.context.panelSizes)
const chatMaximized = useSelector(applicationState, (state) => state.context.panelSizes.chatMaximized ?? false)
const isOnboarding = useSelector(applicationState, (s) => s.hasTag('onboarding'))

const allPlugins = useSelector(applicationState, (state) => state.context.plugins)
/** The plugin offering its panel for plugins without one (`fallbackPanel`), which says itself when it shows */
const fallbackPlugin = computed(() => allPlugins.value.find((p) => p.fallbackPanel && p.panel))
const fallbackActor = computed(() => fallbackPlugin.value && applicationState.system.get(fallbackPlugin.value.id) as ActorRefFrom<AnyStateMachine> | undefined)
const fallbackShown = useSelector(fallbackActor, (snapshot) =>
  !!snapshot && !!fallbackPlugin.value?.fallbackPanel?.isShown(snapshot))

const currentPluginId = computed(() =>
  toggles.value.canvas ? defaultPlugin.value.id : activePlugin.value.id
)

const canShowPanel = computed(() => fallbackShown.value || !!activePlugin.value.panel)
const isPanelOpen = computed(() => panelSizes.value.inspectionWidth > 0)

const allMenuItems = computed<ContextMenuItem[]>(() => {
  const pluginItems = contextMenuItems.value

  const defaultItems: ContextMenuItem[] = [
    {
      label: 'Pop Out Plugin',
      icon: ExternalLink,
      event: { type: 'APP_POPOUT_PLUGIN', pluginId: currentPluginId.value },
      separator: pluginItems.length > 0,
    },
    {
      label: 'Settings',
      icon: SettingsIcon,
      event: { type: 'APP_OPEN_PLUGIN_SETTINGS', pluginId: currentPluginId.value },
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
    ...(fallbackPlugin.value ? [{
      label: fallbackPlugin.value.fallbackPanel!.label,
      icon: Terminal,
      event: { type: 'APP_TOGGLE_FALLBACK_PANEL' },
      isActive: fallbackShown.value,
    }] : []),
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

  if (event.type === 'APP_TOGGLE_FALLBACK_PANEL') {
    const plugin = fallbackPlugin.value
    if (plugin?.fallbackPanel) fallbackActor.value?.send(plugin.fallbackPanel.toggle)
    return
  }

  if (event.type === 'APP_OPEN_PLUGIN_SETTINGS') {
    untypedOpenPlugin(HOST.settings, [
      { type: 'TAB.SELECT', tab: 'plugins' },
      { type: 'PLUGIN.SELECT', pluginId: event.pluginId }
    ])
    return
  }

  if (event.type === 'APP_POPOUT_PLUGIN') {
    const plugin = plugins.value.find((item) => item.id === event.pluginId)
      ?? activePlugin.value
    window.electronAPI?.plugins?.popout(plugin.id, plugin.label)
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
