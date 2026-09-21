import { computed, type Ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { getEditorSystem } from '@abuddy/ui/components/tiptap/editor-system'
import type { CommandItem } from './command-config'
import { id as threadsActorId } from '@/features/threads/fe/state';

export function useCommandItems(query: Ref<string>) {
  const actor = getEditorSystem().get(threadsActorId)
  const commands = useSelector(actor, (state: any) => (state.context.commands || []) as CommandItem[])

  const filteredCommands = computed<CommandItem[]>(() => {
    const q = query.value.toLowerCase()
    if (!q) return commands.value
    return commands.value.filter(cmd => cmd.name.toLowerCase().includes(q))
  })

  return { commands: filteredCommands }
}
