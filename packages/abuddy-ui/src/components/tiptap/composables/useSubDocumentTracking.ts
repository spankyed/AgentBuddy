import { ref } from 'vue'

function collectSubDocumentLinkIds(doc: any): Set<string> {
  const ids = new Set<string>()
  doc.descendants((node: any) => {
    if (node.type.name === 'subDocumentLink' && node.attrs.noteId) {
      ids.add(node.attrs.noteId)
    }
  })
  return ids
}

export function useSubDocumentTracking(emit: {
  subDocumentLinkDeleted: (noteId: string) => void
  subDocumentLinkRestored: (noteId: string) => void
}) {
  const suppressNodeDeletionEvents = ref(false)

  function onTransaction({ transaction }: { transaction: any }) {
    if (!transaction.docChanged || suppressNodeDeletionEvents.value) return
    const oldIds = collectSubDocumentLinkIds(transaction.before)
    const newIds = collectSubDocumentLinkIds(transaction.doc)
    for (const id of oldIds) {
      if (!newIds.has(id)) emit.subDocumentLinkDeleted(id)
    }
    for (const id of newIds) {
      if (!oldIds.has(id)) emit.subDocumentLinkRestored(id)
    }
  }

  return { suppressNodeDeletionEvents, onTransaction }
}
