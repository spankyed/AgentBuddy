import { getAllActions } from './read';
import type { ActionsStartupData } from '../types';

const PAGE_SIZE = 20;

export default function actionsStartupData(page: number = 1): ActionsStartupData {
  const actions = getAllActions();
  
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