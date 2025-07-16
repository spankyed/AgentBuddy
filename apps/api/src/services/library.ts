import { getDocument, getDocumentByShortCode } from '@/systems/library/repository';
import type { DocumentDTO, DocumentShortCode } from '@/systems/library/types';
import { EARS } from '@/core/types';

export class LibraryService {
  async getById(id: EARS.EntityId): Promise<DocumentDTO | undefined> {
    const document = await getDocument(id);
    return document || undefined;
  }

  async getDocByCode(shortCode: string): Promise<DocumentDTO | undefined> {
    const document = await getDocumentByShortCode(shortCode as DocumentShortCode);
    return document || undefined;
  }

  async getByName(name: string): Promise<DocumentDTO | undefined> {
    // For now, we'll need to search through all documents to find by name
    // In a future iteration, we could add a more efficient query method
    const { getDocuments } = await import('@/systems/library/repository');
    const allDocuments = await getDocuments();
    return allDocuments.find(doc => doc.name === name);
  }
}

export const libraryService = new LibraryService();