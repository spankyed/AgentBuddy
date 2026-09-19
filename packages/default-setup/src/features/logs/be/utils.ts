import type { LogEntry } from './types';

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Checks if a log source matches any of the provided exclusion patterns.
 * A pattern matches the source exactly, except that `*` matches anything (`action:*` hides every action's logs).
 * 
 * @param source - The log source to check
 * @param excludedPatterns - Array of patterns to match against
 * @returns true if the source matches any pattern, false otherwise
 */
export function isSourceExcluded(source: string | undefined, excludedPatterns: string[]): boolean {
  if (!source || excludedPatterns.length === 0) {
    return false;
  }
  
  return excludedPatterns.some(pattern => {
    // Everything but `*` is literal: sources like `action:<label>` carry user text
    const regex = new RegExp('^' + pattern.split('*').map(escapeRegExp).join('.*') + '$');
    return regex.test(source);
  });
}

/**
 * Filters an array of logs by removing those whose sources match exclusion patterns.
 * 
 * @param logs - Array of log entries to filter
 * @param excludedSources - Array of source patterns to exclude
 * @returns Filtered array of logs
 */
export function filterLogsByExcludedSources(logs: LogEntry[], excludedSources: string[]): LogEntry[] {
  if (excludedSources.length === 0) {
    return logs;
  }
  
  return logs.filter(log => !isSourceExcluded(log.source, excludedSources));
}