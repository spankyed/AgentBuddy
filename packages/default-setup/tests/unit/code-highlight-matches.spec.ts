// Quick Open renders file names with highlightMatches through v-html: the name is escaped, the matches wrapped
import { describe, expect, it } from 'vitest'
import { highlightMatches } from '@/features/code/fe/utils/fuzzy-search'

describe('highlightMatches', () => {
  it('wraps the matched ranges and escapes the rest', () => {
    expect(highlightMatches('a<b>.ts', [[0, 1], [3, 4]], 'hl')).toBe('<span class="hl">a</span>&lt;b<span class="hl">&gt;</span>.ts')
  })

  it('escapes a name with no matches', () => {
    expect(highlightMatches('<img src=x onerror=alert(1)>.md', [])).toBe('&lt;img src=x onerror=alert(1)&gt;.md')
  })
})
