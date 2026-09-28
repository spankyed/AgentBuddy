import { computed, type Ref } from 'vue'
import { usePluginState } from '#generated/fe.ts'
import type { CommandItem } from './command-config.ts'

export function useCommandItems(query: Ref<string>) {
  const commands = usePluginState('threads', (s) => s.commands)

  const filteredCommands = computed<CommandItem[]>(() => {
    const q = query.value.toLowerCase()
    if (!q) return commands.value
    return commands.value.filter(cmd => cmd.name.toLowerCase().includes(q))
  })

  return { commands: filteredCommands }
}
