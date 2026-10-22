import { computed, type Ref } from 'vue'
import type { PackCommand } from '@apackdev/sdk/commands'
import { useShell } from '@apackdev/sdk/fe'

export function useCommandItems(query: Ref<string>) {
  /**
   * The shell's list, which is the app's: whichever feature plays the `commands` designation serves it and
   * the app publishes it to every window. No surface, so no window in which this is empty because a feature
   * happens not to be spawned.
   *
   * **Through the shell rather than `getCommands()`**, which is the same list read without reactivity: a
   * popup has to re-render when the user edits a command or a pack brings one, and only a ref does that.
   */
  const { commands } = useShell()
  const filteredCommands = computed<PackCommand[]>(() => {
    const q = query.value.toLowerCase()
    if (!q) return [...commands.value]
    return commands.value.filter(cmd => cmd.name.toLowerCase().includes(q))
  })

  return { commands: filteredCommands }
}
