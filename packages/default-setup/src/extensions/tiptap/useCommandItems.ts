import { computed, type Ref } from 'vue'
import { useSurfaceState } from '#generated/fe.ts'
import type { PackCommand } from '@apackdev/sdk/framework'

export function useCommandItems(query: Ref<string>) {
  const commands = useSurfaceState('threads', (s) => s.commands)

  const filteredCommands = computed<PackCommand[]>(() => {
    const q = query.value.toLowerCase()
    if (!q) return commands.value
    return commands.value.filter(cmd => cmd.name.toLowerCase().includes(q))
  })

  return { commands: filteredCommands }
}
