import { getAllActions } from './read';
import { createMockActions } from './mock-data';
import type { ActionsStartupData } from '../types';

const PAGE_SIZE = 20;

export default function actionsStartupData(page: number = 1): ActionsStartupData {
  // Initialize with mock data if no actions exist
  let actions = getAllActions();
  if (actions.length === 0) {
    createMockActions();
    actions = getAllActions();
  }
  
  const totalCount = actions.length;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const startIndex = (page - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  
  return {
    actions: actions.slice(startIndex, endIndex),
    page,
    totalPages,
    totalCount
  };
}