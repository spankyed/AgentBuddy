import { repository } from '@/repository';
import type { DocumentDTO, DocumentShortCode } from '@/systems/library/types';
import { EARS } from '@/core/types';

export class LibraryService {
  async getById(id: EARS.EntityId): Promise<DocumentDTO | undefined> {
    const document = repository.libraryQueries.getDocument(id);
    return document || undefined;
  }

  async getDocByCode(shortCode: string): Promise<DocumentDTO | undefined> {
    const document = repository.libraryQueries.getDocumentByShortCode(shortCode as DocumentShortCode);
    return document || undefined;
  }

  async getByName(name: string): Promise<DocumentDTO | undefined> {
    const allDocuments = repository.libraryQueries.getDocuments();
    return allDocuments.find(doc => doc.name === name);
  }

  async getWithinFolder(folderName: string): Promise<DocumentDTO[]> {
    const collection = repository.libraryQueries.getCollectionByName(folderName);
    
    if (!collection) {
      return [];
    }
    
    return repository.libraryQueries.getDocumentsInCollection(collection.id);
  }
}

export const libraryService = new LibraryService();