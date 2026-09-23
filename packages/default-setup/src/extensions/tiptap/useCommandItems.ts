import { computed, type Ref } from 'vue'
import { useSlashCommands } from '@/features/threads/fe/public'
import type { CommandItem } from './command-config'

export function useCommandItems(query: Ref<string>) {
  const commands = useSlashCommands()

  const filteredCommands = computed<CommandItem[]>(() => {
    const q = query.value.toLowerCase()
    if (!q) return commands.value
    return commands.value.filter(cmd => cmd.name.toLowerCase().includes(q))
  })

  return { commands: filteredCommands }
}
