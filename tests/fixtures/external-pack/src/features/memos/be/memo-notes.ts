// A memo kept as a default-setup note. It's written through @abuddy/ears imported directly, not the generated
// facade, and read back through the SDK's services with default-setup's repository: the pack, the SDK and its
// dependency's runtime share one engine (SHARED_INSTANCE_PACKAGES).
import { tx } from '@abuddy/ears';
import { services } from '#generated/services';

export interface MemoNoteDTO {
  id: string;
  title: string;
}

export function addMemoNote(text: string): MemoNoteDTO | null {
  const id = tx('Note').batchPut({ title: text, content: '', noteType: 'document' }).id();
  const note = services.repository.noteQueries.byIdDTO(id);
  return note ? { id: note.id, title: note.title } : null;
}
