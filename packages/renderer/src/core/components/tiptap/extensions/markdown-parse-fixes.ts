import { Extension } from '@tiptap/core'

export const MarkdownParseFixes = Extension.create({
  name: 'markdownParseFixes',
  addStorage() {
    return {
      markdown: {
        parse: {
          setup(markdownit: any) {
            if (markdownit._markdownParseFixes) return
            markdownit._markdownParseFixes = true

            markdownit.core.ruler.after('block', 'fix-empty-task-items', (state: any) => {
              for (const token of state.tokens) {
                if (token.type === 'inline' && /^\[[ xX]\]$/.test(token.content)) {
                  token.content += ' '
                }
              }
            })

            // Convert &nbsp;-only paragraphs back to empty paragraphs
            markdownit.core.ruler.push('strip-nbsp-empty-lines', (state: any) => {
              for (const token of state.tokens) {
                if (token.type === 'inline' && token.content === '\u00a0') {
                  token.content = ''
                  token.children = []
                }
              }
            })
          },
        },
      },
    }
  },
})
