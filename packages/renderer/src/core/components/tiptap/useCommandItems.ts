import { computed, type Ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id } from '@/plugins/agent/state'
import type { CommandItem } from './command-config'

export function useCommandItems(query: Ref<string>) {
  const actor = applicationState.system.get(id)
  const commands = useSelector(actor, (state: any) => (state.context.commands || []) as CommandItem[])

  const filteredCommands = computed<CommandItem[]>(() => {
    const q = query.value.toLowerCase()
    if (!q) return commands.value
    return commands.value.filter(cmd => cmd.name.toLowerCase().includes(q))
  })

  return { commands: filteredCommands }
}
