// What the threads plugin offers other features: the open thread, its chat settings and slash commands.
// What they may send it is its own `accepts` declaration, beside the plugin.
import type { SnapshotFrom } from 'xstate'
import { readPluginState, usePluginState } from '@abuddy/sdk/fe'
import { ref as featureRef } from '@/__generated__/ref'
import type { CommandItem } from '@/extensions/tiptap/command-config'
import type { ThreadsState } from './state'

/** The ref the threads plugin runs at */
export const THREADS = featureRef('threads')

/** The thread open in the chat */
export function useCurrentThread() {
  return usePluginState(THREADS, (s: SnapshotFrom<ThreadsState>) => s.context.currentThread)
}

/** The threads plugin's settings (chat states among them) */
export function useThreadsSettings() {
  return usePluginState(THREADS, (s: SnapshotFrom<ThreadsState>) => s.context.settings)
}

/** A chat state shown in place of a thread's own for a while, by thread */
export function useChatStateOverrides() {
  return usePluginState(THREADS, (s: SnapshotFrom<ThreadsState>) => s.context.chatStateOverrides)
}

/** The slash commands the chat offers, as they change */
export function useSlashCommands() {
  return usePluginState(THREADS, (s: SnapshotFrom<ThreadsState>) => s.context.commands)
}

/** The slash commands the chat offers now */
export function slashCommands(): CommandItem[] {
  return readPluginState(THREADS, (s: SnapshotFrom<ThreadsState>) => s.context.commands)
}

