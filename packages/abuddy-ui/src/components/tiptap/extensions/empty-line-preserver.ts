import Paragraph from '@tiptap/extension-paragraph'

// Empty paragraphs serialize as &nbsp; so they survive markdown round-trip
export const EmptyLinePreserver = Paragraph.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          if (node.childCount === 0) state.write('&nbsp;')
          else state.renderInline(node)
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})
