import { getDocument, getDocumentByShortCode, getDocuments, getCollectionByName, getDocumentsInCollection } from '@/systems/library/repository';
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
    const allDocuments = await getDocuments();
    return allDocuments.find(doc => doc.name === name);
  }

  async getWithinFolder(folderName: string): Promise<DocumentDTO[]> {
    const collection = await getCollectionByName(folderName);
    
    if (!collection) {
      return [];
    }
    
    return await getDocumentsInCollection(collection.id);
  }
}

export const libraryService = new LibraryService();