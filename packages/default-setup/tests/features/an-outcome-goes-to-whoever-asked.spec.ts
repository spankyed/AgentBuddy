// An import's or an export's outcome reaches the window that started it, and no other.
//
// Six features offer the same pair of commands and every one of them broadcast the result, so a window that
// had imported nothing showed "imported 12" and flipped its own status to success. The data an import
// changed is different — that *is* news, and those sends stay broadcasts.
//
// The rule is derived rather than listed: every feature's outcome events are read off its own outgoing
// contract, so a seventh feature's import cannot be added without appearing here. What each case asks is the
// one question that tells a reply from a broadcast — **with nobody asking, is there still an outcome?**
import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const FEATURES = ['notes', 'actions', 'prompts', 'library', 'threads', 'flows'] as const

const sourceOf = (feature: string, file: string) =>
  fs.readFileSync(path.resolve(import.meta.dirname, `../../src/features/${feature}/be/${file}`), 'utf-8')

/**
 * The call that carries an outcome, named exactly.
 *
 * Walking back to the payload's own `{` and reading the call in front of it, rather than searching a window
 * of characters for `answer(` — a window finds the *neighbouring* send's call and says every outcome is fine.
 * Measured: with that looser check, putting one feature's outcome back on a broadcast changed nothing.
 */
const sentBy = (source: string, type: string): string => {
  const at = source.indexOf(`type: '${type}'`)
  if (at === -1) return 'not sent'
  let depth = 0
  for (let i = at; i >= 0; i--) {
    if (source[i] === '}') depth++
    else if (source[i] === '{') {
      if (depth === 0) return /(\w+)\(\s*$|(\w+)\([^()]*,\s*$/.exec(source.slice(Math.max(0, i - 60), i))?.slice(1).find(Boolean) ?? 'unknown'
      depth--
    }
  }
  return 'unknown'
}

/** The outcome events a feature declares — what an import or an export answers with */
const outcomesOf = (feature: string): string[] => {
  const declared = sourceOf(feature, 'types.ts').match(/'[A-Z_]*(?:IMPORTED|EXPORTED|IMPORT_FAILED|EXPORT_FAILED)'/g) ?? []
  return [...new Set(declared.map((q) => q.slice(1, -1)))]
}

describe('an import or export outcome', () => {
  it('is declared by every feature that offers one, so this checked something', () => {
    const counts = FEATURES.map((f) => [f, outcomesOf(f).length] as const)

    for (const [feature, n] of counts) {
      expect(n, `${feature} declares no outcome events, so the rule below says nothing about it`).toBeGreaterThan(2)
    }
  })

  /**
   * Answered, never broadcast. `answer(reply, …)` is each feature's one-line helper: it replies where there
   * is an asker and broadcasts where there is none, which is the only case a broadcast is right for.
   */
  it.each(FEATURES)('%s answers it rather than telling every window', (feature) => {
    const system = sourceOf(feature, 'system.ts')
    const outcomes = outcomesOf(feature)

    const broadcast = outcomes.filter((type) => sentBy(system, type) !== 'answer')

    expect(broadcast, `${feature} broadcasts an outcome instead of answering the window that asked`).toEqual([])
  })
})
