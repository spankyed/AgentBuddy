import { computed, type ComputedRef } from 'vue'
import { useSelector } from '@xstate/vue'
import type { EARS } from '@abuddy/api'
import { applicationState } from '@/app'
import { flowsId } from '../state'
import type { NodeViewModel } from '../types/view-models'
import { NODE_VIEW_MODEL_CONFIG, createNodeViewModel, type ViewModelStores } from '../types/view-model-config'

/**
 * Vue composable for accessing node view models
 * Provides reactive, computed node data with resolved entities
 */
export function useNodeViewModel(nodeId: EARS.EntityId): ComputedRef<NodeViewModel | null> {
  const flowsActor = applicationState.system.get(flowsId)
  
  const nodes = useSelector(flowsActor, (state: any) => state.context.graph.nodes)
  const prompts = useSelector(flowsActor, (state: any) => state.context.prompts)
  const models = useSelector(flowsActor, (state: any) => state.context.models)
  const actions = useSelector(flowsActor, (state: any) => state.context.actions)
  
  return computed(() => {
    const node = nodes.value.find((n: any) => n.id === nodeId)
    if (!node) return null
    
    const stores: ViewModelStores = {
      prompts: prompts.value,
      models: models.value,
      actions: actions.value
    }
    
    // Base view model
    const viewModel: NodeViewModel = {
      id: node.id,
      nodeType: node.nodeType,
      label: node.label,
      position: node.x && node.y ? { x: node.x, y: node.y } : undefined,
    }
    
    // Get view model config for this node type
    const config = NODE_VIEW_MODEL_CONFIG[node.nodeType]
    if (config) {
      viewModel.extension = createNodeViewModel(node, stores, config)
    }
    
    return viewModel
  })
}

/**
 * Type-safe node form composable with single update pattern
 * Provides a simple interface for updating nodes
 */
export function useNodeForm(nodeId: EARS.EntityId) {
  const flowsActor = applicationState.system.get(flowsId)
  const nodeViewModel = useNodeViewModel(nodeId)
  
  const node = computed(() => nodeViewModel.value)
  const extension = computed(() => nodeViewModel.value?.extension)
  
  const updateNode = (updates: Record<string, any>) => {
    flowsActor.send({
      type: 'NODE.UPDATE',
      nodeId,
      updates,
    })
  }
  
  const updateLabel = (label: string) => {
    updateNode({ label })
  }
  
  return {
    node,
    extension,
    updateNode,
    updateLabel,
  }
}