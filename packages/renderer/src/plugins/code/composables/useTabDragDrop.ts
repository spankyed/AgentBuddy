import { ref, type Ref } from 'vue'
import type { OpenFile, TerminalTab, TabGroup } from '../state'
import type { ActionTab } from '../features/actions/state'
import type { PromptTab } from '../features/prompts/state'

type Tab = OpenFile | TerminalTab | ActionTab | PromptTab
type Context = 'pinned' | 'ungrouped' | string

interface UseTabDragDropOptions {
  tabs: Ref<Tab[]>
  pinnedTabs: Ref<Tab[]>
  ungroupedTabs: Ref<Tab[]>
  getTabsForGroup: (groupId: string) => Tab[]
  tabGroups: Ref<TabGroup[]>
  pinnedContainer: Ref<HTMLElement | null>
  mainContainer: Ref<HTMLElement | null>
  onPinTab: (path: string) => void
  onUnpinTab: (path: string) => void
  onAddToGroup: (path: string, groupId: string) => void
  onRemoveFromGroup: (path: string) => void
  onReorder: (fromIndex: number, toIndex: number) => void
}

export function useTabDragDrop(options: UseTabDragDropOptions) {
  const {
    tabs,
    pinnedTabs,
    ungroupedTabs,
    getTabsForGroup,
    tabGroups,
    pinnedContainer,
    mainContainer,
    onPinTab,
    onUnpinTab,
    onAddToGroup,
    onRemoveFromGroup,
    onReorder
  } = options

  // Helper functions
  const getContextTabs = (context: Context): Tab[] => {
    if (context === 'pinned') return pinnedTabs.value
    if (context === 'ungrouped') return ungroupedTabs.value
    return getTabsForGroup(context)
  }

  const getContextFromElement = (el: HTMLElement): Context => {
    const tabGroupId = el.dataset.groupId
    const tabContext = el.dataset.context
    return tabGroupId || tabContext || 'ungrouped'
  }

  const resetDragState = () => {
    draggedTab.value = null
    dropPosition.value = { index: null, side: 'left', context: 'pinned' }
  }

  // Drag state
  const draggedTab = ref<{ path: string; groupId?: string } | null>(null)
  const dropPosition = ref<{
    index: number | null
    side: 'left' | 'right'
    context: Context
  } | null>({ index: null, side: 'left', context: 'pinned' })

  // Drag handlers
  const handleDragStart = (tab: Tab, event: DragEvent) => {
    const groupId = 'groupId' in tab ? tab.groupId : undefined
    draggedTab.value = { path: tab.path, groupId }
    event.dataTransfer!.effectAllowed = 'move'
    event.dataTransfer!.setData('text/plain', JSON.stringify(draggedTab.value))
  }

  const handleDragOver = (event: DragEvent) => {
    if (!draggedTab.value) return

    event.preventDefault()
    event.dataTransfer!.dropEffect = 'move'

    const containerEl = event.currentTarget as HTMLElement
    const containerType = containerEl.dataset.container
    if (!containerType) return

    const tabElements = Array.from(containerEl.querySelectorAll('.tab-item')) as HTMLElement[]
    const validTabs = tabElements.filter(el => el.dataset.path !== draggedTab.value?.path)

    // Empty container - position at start
    if (validTabs.length === 0) {
      const context = containerType === 'pinned' ? 'pinned' : 'ungrouped'
      dropPosition.value = { index: 0, side: 'left', context }
      return
    }

    const mouseX = event.clientX

    // Helper to set drop position for a given element
    const setDropPositionForElement = (el: HTMLElement, side: 'left' | 'right') => {
      const tabPath = el.dataset.path
      if (!tabPath) return false

      const context = getContextFromElement(el)
      const contextTabs = getContextTabs(context)
      const index = contextTabs.findIndex(t => t.path === tabPath)

      if (index === -1) return false

      dropPosition.value = { index, side, context }
      return true
    }

    // Find tab under mouse
    for (let i = 0; i < validTabs.length; i++) {
      const el = validTabs[i]
      const rect = el.getBoundingClientRect()
      const nextRect = validTabs[i + 1]?.getBoundingClientRect()
      const endX = nextRect ? nextRect.left : rect.right + 50

      if (mouseX >= rect.left && mouseX <= endX) {
        const side = mouseX < rect.left + rect.width / 2 ? 'left' : 'right'
        setDropPositionForElement(el, side)
        return
      }
    }

    // Mouse beyond all tabs - position at end of last tab
    setDropPositionForElement(validTabs[validTabs.length - 1], 'right')
  }

  const handleDrop = (event: DragEvent) => {
    if (!draggedTab.value || !dropPosition.value || dropPosition.value.index === null) return

    event.preventDefault()

    const sourceTab = tabs.value.find(t => t.path === draggedTab.value!.path)
    if (!sourceTab) return

    const sourceContext = sourceTab.isPinned ? 'pinned' : (draggedTab.value.groupId || 'ungrouped')
    const { context: targetContext, index: targetIndex, side: targetSide } = dropPosition.value
    const targetContextTabs = getContextTabs(targetContext)

    // Handle context changes
    if (sourceContext !== targetContext) {
      // Moving to pinned
      if (targetContext === 'pinned') {
        onPinTab(sourceTab.path)
        resetDragState()
        return
      }

      // Moving from pinned
      if (sourceContext === 'pinned') {
        onUnpinTab(sourceTab.path)
        if (targetContext !== 'ungrouped') {
          onAddToGroup(sourceTab.path, targetContext)
        }
        resetDragState()
        return
      }

      // Moving between groups or to/from ungrouped
      if (sourceContext !== 'ungrouped') {
        onRemoveFromGroup(sourceTab.path)
      }
      if (targetContext !== 'ungrouped') {
        onAddToGroup(sourceTab.path, targetContext)
      }
      resetDragState()
      return
    }

    // Handle reordering within same context
    if (targetContextTabs.length > 1) {
      const sourceIndex = tabs.value.findIndex(t => t.path === sourceTab.path)
      const targetTabIndex = targetSide === 'right'
        ? Math.min(targetIndex + 1, targetContextTabs.length - 1)
        : targetIndex

      const targetTab = targetContextTabs[targetTabIndex]
      if (targetTab) {
        const fullTargetIndex = tabs.value.findIndex(t => t.path === targetTab.path)
        if (sourceIndex !== fullTargetIndex) {
          onReorder(sourceIndex, fullTargetIndex)
        }
      }
    }

    resetDragState()
  }

  const handleDragEnd = () => {
    resetDragState()
  }

  const handleDragLeave = (event: DragEvent) => {
    const relatedTarget = event.relatedTarget as HTMLElement

    // Only reset if the mouse left both containers entirely
    const isInPinned = pinnedContainer.value?.contains(relatedTarget)
    const isInMain = mainContainer.value?.contains(relatedTarget)

    if (!isInPinned && !isInMain) {
      resetDragState()
    }
  }

  // Drop indicator styling
  const getDropIndicatorStyle = () => {
    if (!dropPosition.value || dropPosition.value.index === null) return {}

    const { context, index, side } = dropPosition.value
    const container = context === 'pinned' ? pinnedContainer.value : mainContainer.value
    if (!container) return {}

    const contextTabs = getContextTabs(context)
    if (index < 0 || index >= contextTabs.length) return {}

    const targetTab = contextTabs[index]
    if (!targetTab) return {}

    const tabElement = container.querySelector(`[data-path="${CSS.escape(targetTab.path)}"]`) as HTMLElement
    if (!tabElement) return {}

    const rect = tabElement.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const left = (side === 'left' ? rect.left : rect.right) - containerRect.left + container.scrollLeft

    const group = tabGroups.value.find(g => g.id === context)
    const backgroundColor = group ? `var(--color-${group.color})` : 'rgb(59, 130, 246)'

    return { left: `${left}px`, backgroundColor }
  }

  return {
    draggedTab,
    dropPosition,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    handleDragLeave,
    getDropIndicatorStyle
  }
}
