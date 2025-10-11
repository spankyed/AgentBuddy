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

    // Check if hovering over the gap where dragged tab originally was
    const sourceTab = tabs.value.find(t => t.path === draggedTab.value!.path)
    if (sourceTab) {
      const sourceContext = sourceTab.isPinned ? 'pinned' : (draggedTab.value.groupId || 'ungrouped')

      // Determine if we're in the same container as the dragged tab
      const isInSameContainer = (sourceContext === 'pinned' && containerType === 'pinned') ||
                                (sourceContext !== 'pinned' && containerType !== 'pinned')

      if (isInSameContainer) {
        const contextTabs = getContextTabs(sourceContext)
        const sourceIndex = contextTabs.findIndex(t => t.path === sourceTab.path)

        if (sourceIndex !== -1) {
          const prevTab = sourceIndex > 0 ? contextTabs[sourceIndex - 1] : null
          const nextTab = sourceIndex < contextTabs.length - 1 ? contextTabs[sourceIndex + 1] : null

          // Only apply gap logic if there are adjacent tabs on both sides
          if (prevTab && nextTab) {
            const prevEl = validTabs.find(el => el.dataset.path === prevTab.path)
            const nextEl = validTabs.find(el => el.dataset.path === nextTab.path)

            if (prevEl && nextEl) {
              const prevRect = prevEl.getBoundingClientRect()
              const nextRect = nextEl.getBoundingClientRect()
              const gapLeft = prevRect.right
              const gapRight = nextRect.left

              // Check if mouse is within the gap
              if (mouseX >= gapLeft && mouseX <= gapRight) {
                const gapWidth = gapRight - gapLeft
                const relativeX = mouseX - gapLeft
                const leftThreshold = gapWidth * 0.2
                const rightThreshold = gapWidth * 0.8

                if (relativeX < leftThreshold) {
                  // Left 20% - show indicator before next tab
                  setDropPositionForElement(nextEl, 'left')
                } else if (relativeX > rightThreshold) {
                  // Right 20% - show indicator after prev tab
                  setDropPositionForElement(prevEl, 'right')
                } else {
                  // Middle 60% - no indicator (tab stays in place)
                  dropPosition.value = { index: null, side: 'left', context: sourceContext }
                }
                return
              }
            }
          }
        }
      }
    }

    // Find tab under mouse (normal detection)
    for (let i = 0; i < validTabs.length; i++) {
      const el = validTabs[i]
      const rect = el.getBoundingClientRect()
      const nextEl = validTabs[i + 1]
      const nextRect = nextEl?.getBoundingClientRect()

      // Extend the hit area to the midpoint between this tab and the next
      const endX = nextRect ? (rect.right + nextRect.left) / 2 : rect.right + 50

      if (mouseX >= rect.left && mouseX <= endX) {
        const side = mouseX < rect.left + rect.width / 2 ? 'left' : 'right'
        setDropPositionForElement(el, side)
        return
      }
    }

    // Only position at end if mouse is actually beyond the last tab
    const lastTabRect = validTabs[validTabs.length - 1].getBoundingClientRect()
    if (mouseX > lastTabRect.right) {
      setDropPositionForElement(validTabs[validTabs.length - 1], 'right')
    }
  }

  const handleDrop = (event: DragEvent) => {
    if (!draggedTab.value || !dropPosition.value) return

    event.preventDefault()

    // If index is null, tab stays in place (dropped in middle 60% zone)
    if (dropPosition.value.index === null) {
      resetDragState()
      return
    }

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

      // Get the target tab from context tabs (which excludes the dragged tab)
      const targetTab = targetContextTabs[targetIndex]
      if (!targetTab) return

      // Find target's position in the full array (includes dragged tab)
      const fullTargetIndex = tabs.value.findIndex(t => t.path === targetTab.path)

      // Calculate the correct insertion index accounting for the removal of the source tab
      // When reorderTabs removes the source, indices shift, so we need to adjust
      let insertIndex: number

      if (targetSide === 'left') {
        // Insert BEFORE the target
        insertIndex = sourceIndex < fullTargetIndex
          ? fullTargetIndex - 1  // Source is before target, removal shifts target left
          : fullTargetIndex       // Source is after target, target position unchanged
      } else {
        // Insert AFTER the target
        insertIndex = sourceIndex < fullTargetIndex
          ? fullTargetIndex       // Source is before target, this puts it after
          : fullTargetIndex + 1   // Source is after target, need to move past it
      }

      if (sourceIndex !== insertIndex) {
        onReorder(sourceIndex, insertIndex)
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
