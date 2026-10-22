import { startFeTestRuntime, stopFeTestRuntime } from '@apackdev/sdk/testing'
import { createApp, h, nextTick } from 'vue'
import { Editor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import CommandSuggestionPopup from '#extensions/tiptap/CommandSuggestionPopup.vue'
import { CommandSuggestion, commandSuggestionKey } from '#extensions/tiptap/command-suggestion.ts'
vi.mock('#extensions/tiptap/useCommandItems.ts', async () => { const { ref } = await import('vue'); return { useCommandItems: () => ({ commands: ref([]) }) } })
it('preserves an unmatched native slash command when clicking Send outside the app picker', async () => {
  const root = document.createElement('div'), form = document.createElement('form'), send = document.createElement('button')
  send.type = 'submit'; send.textContent = 'Send'; form.append(send); document.body.append(root, form)
  startFeTestRuntime({ application: { system: { get: () => undefined } } as never })
  const editor = new Editor({ extensions: [StarterKit, CommandSuggestion], content: '' })
  const app = createApp({ render: () => h(CommandSuggestionPopup, { editor }) }); app.mount(root)
  try {
    editor.commands.setContent('/context'); editor.commands.setTextSelection(editor.state.doc.content.size - 1); await nextTick(); await nextTick()
    await vi.waitFor(() => expect(document.querySelector('.command-suggestion-popup')).not.toBeNull())
    send.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(editor.state.doc.textContent).toBe('/context')
    expect(commandSuggestionKey.getState(editor.state)?.active).toBe(false)
  } finally { app.unmount(); editor.destroy(); stopFeTestRuntime(); document.body.replaceChildren() }
})
