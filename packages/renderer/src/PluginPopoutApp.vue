<template>
  <div class="flex flex-col h-screen bg-neutral-950 text-neutral-100">
    <ToastNotification ref="toast" />

    <div class="flex flex-1 min-h-0 overflow-hidden">
      <div
        class="flex min-w-0 flex-1 flex-col overflow-hidden border-b border-neutral-800 bg-neutral-900"
        :style="{ width: canShowPanel && panelSizes.inspectionWidth > 0 ? `calc(100% - ${panelSizes.inspectionWidth}px)` : '100%' }"
      >
        <PopoutTitlebar
          :breadcrumbs="breadcrumbs"
          :menu-items="allMenuItems"
          :header-class="activePlugin.options?.headerClass"
          @crumb-click="(target: string, info?: any) => send({ type: 'TRAIL_CLICK', target, info })"
          @menu-action="handleMenuAction"
        />
        <div class="min-h-0 flex-1 overflow-y-auto">
          <Router :views="activePlugin.canvas" :target="targetView" />
        </div>
      </div>

      <PanelResizer
        v-if="canShowPanel"
        orientation="horizontal"
        :collapsed="!isPanelOpen"
        @resize="handleInspectionResize"
        @click="send({ type: 'TOGGLE_INSPECTION_PANEL' })"
      />

      <InspectionPanel
        v-if="canShowPanel && panelSizes.inspectionWidth > 0"
        :style="{ width: `${panelSizes.inspectionWidth}px` }"
        :label="`${activePlugin.label} Inspection`"
      >
        <component :is="activePlugin.panel" />
      </InspectionPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { PanelRight } from 'lucide-vue-next'
import { applicationState } from '@/main'
import InspectionPanel from '@/core/components/layout/inspection-panel.vue'
import PanelResizer from '@/core/components/layout/panel-resizer.vue'
import PopoutTitlebar from '@/core/components/layout/PopoutTitlebar.vue'
import Router from '@/core/components/layout/router.vue'
import ToastNotification from '@/core/components/design/ToastNotification.vue'
import { registerGlobalToast } from '@/core/toast'
import type { ContextMenuItem } from '@/core/context-menu'

const send = applicationState.send
const toast = ref<InstanceType<typeof ToastNotification> | null>(null)

onMounted(() => registerGlobalToast(toast.value))
onUnmounted(() => registerGlobalToast(null))

const activePlugin = useSelector(applicationState, (state) => state.context.activePlugin)
const breadcrumbs = useSelector(applicationState, (state) => state.context.breadcrumbs)
const contextMenuItems = useSelector(applicationState, (state) => state.context.contextMenuItems)
const targetView = useSelector(applicationState, (state) => state.context.targetView)
const panelSizes = useSelector(applicationState, (state) => state.context.panelSizes)

const canShowPanel = computed(() => !!activePlugin.value.panel)
const isPanelOpen = computed(() => panelSizes.value.inspectionWidth > 0)

const allMenuItems = computed<ContextMenuItem[]>(() => [
  ...contextMenuItems.value,
  ...(canShowPanel.value ? [{
    label: 'Context Panel',
    icon: PanelRight,
    event: { type: 'APP_TOGGLE_INSPECTION_PANEL' },
    isActive: isPanelOpen.value,
    separator: contextMenuItems.value.length > 0,
  }] : []),
])

const handleInspectionResize = (delta: number) => {
  const newWidth = panelSizes.value.inspectionWidth - delta
  send({ type: 'RESIZE_PANEL', panel: 'inspection', size: newWidth })
}

const handleMenuAction = (event: { type: string; [key: string]: any }) => {
  if (event.type === 'APP_TOGGLE_INSPECTION_PANEL') {
    send({ type: 'TOGGLE_INSPECTION_PANEL' })
    return
  }

  if (event.type === 'APP_COPY_TO_CLIPBOARD') {
    navigator.clipboard.writeText(event.text)
    return
  }

  applicationState.system.get(activePlugin.value.id)?.send(event)
}
</script>
