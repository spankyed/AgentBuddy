import type { LogEntry } from './types';

/**
 * Checks if a log source matches any of the provided exclusion patterns.
 * Supports wildcards (*) in patterns.
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
    // Support wildcards: convert * to regex
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
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