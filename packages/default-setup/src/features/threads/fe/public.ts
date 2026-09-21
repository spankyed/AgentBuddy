// What the threads plugin offers other features: the open thread, its chat settings and slash commands, and the
// artifact and to-do list events its views take. Other features import this module, never the plugin's machine.
import { useSelector } from '@xstate/vue'
import { pluginHandle } from '@/features/plugin-handle'
import type { CommandItem } from '@/extensions/tiptap/command-config'
import type { ThreadsState } from './state'

/** The threads plugin's actor, which its machine binds as it starts */
export const threadsPlugin = pluginHandle<ThreadsState>('threads')

/** The thread open in the chat */
export function useCurrentThread() {
  return useSelector(threadsPlugin.get(), (state) => state.context.currentThread)
}

/** The threads plugin's settings (chat states among them) */
export function useThreadsSettings() {
  return useSelector(threadsPlugin.get(), (state) => state.context.settings)
}

/** A chat state shown in place of a thread's own for a while, by thread */
export function useChatStateOverrides() {
  return useSelector(threadsPlugin.get(), (state) => state.context.chatStateOverrides)
}

/** The slash commands the chat offers, as they change */
export function useSlashCommands() {
  return useSelector(threadsPlugin.get(), (state) => state.context.commands)
}

/** The slash commands the chat offers now */
export function slashCommands(): CommandItem[] {
  return threadsPlugin.get().getSnapshot().context.commands
}

/** Shows an artifact of the open thread */
export function selectArtifact(artifactId: string): void {
  threadsPlugin.get().send({ type: 'SELECT_ARTIFACT', artifactId })
}

/** Answers a to-do list artifact's request for approval */
export function approveTodoList(artifactId: string, tasks: unknown[]): void {
  threadsPlugin.get().send({ type: 'APPROVE_TODO_LIST', artifactId, tasks })
}

export function rejectTodoList(artifactId: string): void {
  threadsPlugin.get().send({ type: 'REJECT_TODO_LIST', artifactId })
}
