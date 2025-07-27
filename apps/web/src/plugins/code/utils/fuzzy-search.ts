/**
 * Fuzzy search implementation inspired by VS Code's fuzzy scoring algorithm
 * Rewards: word starts, camel-case boundaries, contiguous matches
 * Penalizes: gaps between matches, distance from start
 */

export interface FuzzyMatch {
  score: number
  positions: number[] // Character positions that matched
}

export interface FuzzySearchResult<T> {
  item: T
  score: number
  positions: number[]
  matchRanges: Array<[number, number]> // For highlighting
}

// Scoring constants (inspired by VS Code)
const SCORE_MATCH = 1
const SCORE_WORD_START = 7
const SCORE_CAMEL_CASE = 5
const SCORE_CONSECUTIVE = 1
const SCORE_GAP_PENALTY = -3
const SCORE_DISTANCE_FROM_START = -1

/**
 * Check if a character is uppercase
 */
function isUpperCase(char: string): boolean {
  return char === char.toUpperCase() && char !== char.toLowerCase()
}

/**
 * Check if this is a word boundary
 */
function isWordBoundary(str: string, index: number): boolean {
  if (index === 0) return true
  
  const curr = str[index]
  const prev = str[index - 1]
  
  // Previous char is separator
  if (/[\s\-_./\\]/.test(prev)) return true
  
  // CamelCase boundary
  if (!isUpperCase(prev) && isUpperCase(curr)) return true
  
  return false
}

/**
 * Score a single match based on its position and context
 */
function scoreMatch(
  target: string,
  targetIndex: number,
  isConsecutive: boolean,
  distanceFromLastMatch: number
): number {
  let score = SCORE_MATCH
  
  // Bonus for matching at word boundaries
  if (isWordBoundary(target, targetIndex)) {
    score += SCORE_WORD_START
  }
  
  // Bonus for camelCase matches
  if (targetIndex > 0 && isUpperCase(target[targetIndex])) {
    score += SCORE_CAMEL_CASE
  }
  
  // Bonus for consecutive matches
  if (isConsecutive) {
    score += SCORE_CONSECUTIVE
  }
  
  // Penalty for gaps between matches
  if (distanceFromLastMatch > 1) {
    score += SCORE_GAP_PENALTY * (distanceFromLastMatch - 1)
  }
  
  // Small penalty for distance from start
  score += SCORE_DISTANCE_FROM_START * targetIndex * 0.01
  
  return score
}

/**
 * Fuzzy match a pattern against a target string
 */
export function fuzzyMatch(pattern: string, target: string): FuzzyMatch | null {
  if (!pattern || !target) return null
  
  const patternLower = pattern.toLowerCase()
  const targetLower = target.toLowerCase()
  
  let patternIndex = 0
  let targetIndex = 0
  let score = 0
  let lastMatchIndex = -1
  const positions: number[] = []
  
  // Try to match all pattern characters
  while (patternIndex < pattern.length && targetIndex < target.length) {
    if (patternLower[patternIndex] === targetLower[targetIndex]) {
      const isConsecutive = lastMatchIndex === targetIndex - 1
      const distanceFromLastMatch = lastMatchIndex === -1 ? 0 : targetIndex - lastMatchIndex
      
      score += scoreMatch(target, targetIndex, isConsecutive, distanceFromLastMatch)
      positions.push(targetIndex)
      
      lastMatchIndex = targetIndex
      patternIndex++
    }
    targetIndex++
  }
  
  // Did we match all pattern characters?
  if (patternIndex !== pattern.length) {
    return null
  }
  
  // Apply length penalty - prefer shorter matches
  score -= (target.length - pattern.length) * 0.1
  
  // Bonus for exact match
  if (pattern.length === target.length && patternLower === targetLower) {
    score += 10
  }
  
  return { score, positions }
}

/**
 * Convert match positions to ranges for highlighting
 */
function positionsToRanges(positions: number[]): Array<[number, number]> {
  if (positions.length === 0) return []
  
  const ranges: Array<[number, number]> = []
  let start = positions[0]
  let end = positions[0]
  
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] === end + 1) {
      // Consecutive match, extend range
      end = positions[i]
    } else {
      // Gap in matches, close current range and start new one
      ranges.push([start, end + 1])
      start = positions[i]
      end = positions[i]
    }
  }
  
  // Close final range
  ranges.push([start, end + 1])
  
  return ranges
}

/**
 * Search through items using fuzzy matching
 */
export function fuzzySearch<T>(
  pattern: string,
  items: T[],
  getText: (item: T) => string,
  maxResults: number = 100
): FuzzySearchResult<T>[] {
  if (!pattern.trim()) {
    // Return all items when pattern is empty
    return items.slice(0, maxResults).map(item => ({
      item,
      score: 0,
      positions: [],
      matchRanges: []
    }))
  }
  
  const results: FuzzySearchResult<T>[] = []
  
  for (const item of items) {
    const text = getText(item)
    const match = fuzzyMatch(pattern, text)
    
    if (match) {
      results.push({
        item,
        score: match.score,
        positions: match.positions,
        matchRanges: positionsToRanges(match.positions)
      })
    }
  }
  
  // Sort by score (descending)
  results.sort((a, b) => b.score - a.score)
  
  // Return top results
  return results.slice(0, maxResults)
}

/**
 * Highlight matched portions of text
 */
export function highlightMatches(
  text: string,
  ranges: Array<[number, number]>,
  highlightClass: string = 'fuzzy-match-highlight'
): string {
  if (ranges.length === 0) return text
  
  let result = ''
  let lastEnd = 0
  
  for (const [start, end] of ranges) {
    // Add text before match
    result += text.slice(lastEnd, start)
    // Add highlighted match
    result += `<span class="${highlightClass}">${text.slice(start, end)}</span>`
    lastEnd = end
  }
  
  // Add remaining text
  result += text.slice(lastEnd)
  
  return result
}