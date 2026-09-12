import type { LogEntry } from './state';

export interface SearchFilter {
  includes: string[];
  excludes: string[];
}

export function parseSearchTerm(searchTerm: string): SearchFilter {
  if (!searchTerm || !searchTerm.trim()) {
    return { includes: [], excludes: [] };
  }

  const terms = searchTerm.trim().split(/\s+/);
  const includes: string[] = [];
  const excludes: string[] = [];

  for (const term of terms) {
    if (term.startsWith('-') && term.length > 1) {
      excludes.push(term.substring(1).toLowerCase());
    } else if (term && term !== '-') {
      includes.push(term.toLowerCase());
    }
  }

  return { includes, excludes };
}

export function searchLog(log: LogEntry, filter: SearchFilter): boolean {
  // If no search terms, include everything
  if (filter.includes.length === 0 && filter.excludes.length === 0) {
    return true;
  }

  const searchableContent = [
    log.message,
    log.source || '',
    log.meta ? JSON.stringify(log.meta) : ''
  ].join(' ').toLowerCase();

  // Check excludes first - if any exclude term matches, exclude the log
  for (const exclude of filter.excludes) {
    if (searchableContent.includes(exclude)) {
      return false;
    }
  }

  // If there are no include terms, and we passed excludes, include the log
  if (filter.includes.length === 0) {
    return true;
  }

  // Check includes - at least one include term must match
  for (const include of filter.includes) {
    if (searchableContent.includes(include)) {
      return true;
    }
  }

  return false;
}

export function highlightSearchTerm(text: string, searchTerm: string): string {
  if (!searchTerm || !searchTerm.trim()) {
    return text;
  }

  const filter = parseSearchTerm(searchTerm);
  
  // Only highlight include terms, not exclude terms
  if (filter.includes.length === 0) {
    return text;
  }

  // Create a regex pattern for all include terms
  const pattern = filter.includes
    .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  
  const regex = new RegExp(`(${pattern})`, 'gi');
  return text.replace(regex, '<mark class="text-yellow-200 bg-yellow-500/30">$1</mark>');
}