// What `{{segment N}}` means, for the backend that builds indexed text and the editor that previews it. The
// five call sites this replaced each filled placeholders with `result = result.replace('{{segment 1}}', text)`,
// and every case below fails against that shape — which is why they are here rather than in the dormant
// search-index service, where nothing typechecks and no spec can import past fastembed and usearch.
import { describe, expect, it } from 'vitest'
import { fillSegments } from '#features/library/segment-template.ts'

/** Segments by their 1-based number, as an author's `{{segment N}}` names them */
const from = (...texts: string[]) => (n: number) => texts[n - 1]

describe('filling a search index template', () => {
  it('fills a placeholder from the segment its number names', () => {
    expect(fillSegments('{{segment 2}}: {{segment 1}}', from('body', 'title'))).toBe('title: body')
  })

  // A string pattern replaces the first occurrence only, so this used to drop the repeat — blanked on the one
  // path with a cleanup pass, left as a literal on the other four
  it('fills every occurrence, not the first', () => {
    expect(fillSegments('{{segment 1}} — {{segment 1}}', from('note'))).toBe('note — note')
  })

  // Four of the five paths had no cleanup, so `{{segment 7}}` went into the text that is embedded and stored
  it('replaces a placeholder with no segment rather than leaving it in the text', () => {
    expect(fillSegments('{{segment 1}} {{segment 7}}', from('only'))).toBe('only ')
  })

  it('takes what an unfilled placeholder becomes from its caller', () => {
    expect(fillSegments('{{segment 7}}', from(), '[segment content...]')).toBe('[segment content...]')
  })

  // `String.replace` reads `$&`, `` $` ``, `$'` and `$n` in a string *replacement* — so a document containing
  // them was rewritten with parts of the template. A replacer's return value is used verbatim, which is the
  // half `replaceAll` would not have fixed
  it('puts segment text in verbatim, even when it reads as a replacement pattern', () => {
    const dollars = String.raw`costs $& and $\` and $' and $1`
    expect(fillSegments('{{segment 1}}!', from(dollars))).toBe(`${dollars}!`)
  })

  // The old shape assigned back into the string it was scanning, so the next pass filled placeholders that had
  // arrived with the content rather than the ones the author wrote
  it('does not substitute into text it has already filled in', () => {
    expect(fillSegments('{{segment 1}} {{segment 2}}', from('literally {{segment 2}}', 'second')))
      .toBe('literally {{segment 2}} second')
  })

  it('leaves a template with no placeholders alone', () => {
    expect(fillSegments('nothing to fill', from('unused'))).toBe('nothing to fill')
  })

  // The editor offers `{{segment 1}}`-style chips, but the field is free text: anything that is not one stays
  it('ignores text that only looks like a placeholder', () => {
    expect(fillSegments('{{segment}} {{ segment 1 }} {{segment one}}', from('filled')))
      .toBe('{{segment}} {{ segment 1 }} {{segment one}}')
  })

  // `{{segment 0}}` has no rule — `segmentRules` is 1-based in the template and 0-based in the array — so it is
  // unfilled rather than the first rule's text
  it('treats segment 0 as naming no segment', () => {
    expect(fillSegments('{{segment 0}}', from('first'))).toBe('')
  })
})
