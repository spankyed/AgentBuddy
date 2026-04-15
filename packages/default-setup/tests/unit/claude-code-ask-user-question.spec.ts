/**
 * Unit test for `parseAskUserQuestionInput` — the parser for the
 * AskUserQuestion tool input used by chat.ts to render interactive
 * choice blocks.
 */

import { parseAskUserQuestionInput } from '../../src/actions/claude-code/_helpers/ask-user-question'

describe('parseAskUserQuestionInput', () => {
  // ─── Well-formed input ──────────────────────────────────────────

  it('parses a single question with options', () => {
    const result = parseAskUserQuestionInput({
      questions: [{
        question: 'Which approach?',
        header: 'Approach',
        options: [
          { label: 'Option A', description: 'Do X' },
          { label: 'Option B', description: 'Do Y' },
        ],
        multiSelect: false,
      }],
    })
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0].question).toBe('Which approach?')
    expect(result.questions[0].header).toBe('Approach')
    expect(result.questions[0].options).toEqual([
      { label: 'Option A', description: 'Do X' },
      { label: 'Option B', description: 'Do Y' },
    ])
    expect(result.questions[0].multiSelect).toBe(false)
  })

  it('parses multiple questions', () => {
    const result = parseAskUserQuestionInput({
      questions: [
        { question: 'Q1?', header: 'H1', options: [{ label: 'A', description: '' }], multiSelect: false },
        { question: 'Q2?', header: 'H2', options: [{ label: 'B', description: 'desc' }], multiSelect: true },
      ],
    })
    expect(result.questions).toHaveLength(2)
    expect(result.questions[0].question).toBe('Q1?')
    expect(result.questions[1].multiSelect).toBe(true)
  })

  it('defaults header to empty string when missing', () => {
    const result = parseAskUserQuestionInput({
      questions: [{ question: 'Q?', options: [{ label: 'A', description: '' }] }],
    })
    expect(result.questions[0].header).toBe('')
  })

  it('defaults multiSelect to false when missing', () => {
    const result = parseAskUserQuestionInput({
      questions: [{ question: 'Q?', header: 'H', options: [{ label: 'A', description: '' }] }],
    })
    expect(result.questions[0].multiSelect).toBe(false)
  })

  it('defaults description to empty string when missing from option', () => {
    const result = parseAskUserQuestionInput({
      questions: [{ question: 'Q?', header: 'H', options: [{ label: 'A' }], multiSelect: false }],
    })
    expect(result.questions[0].options[0].description).toBe('')
  })

  it('accepts questions with zero options', () => {
    const result = parseAskUserQuestionInput({
      questions: [{ question: 'Q?', header: 'H', options: [], multiSelect: false }],
    })
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0].options).toEqual([])
  })

  // ─── Skips invalid entries ──────────────────────────────────────

  it('skips questions without a question string', () => {
    const result = parseAskUserQuestionInput({
      questions: [
        { header: 'H', options: [{ label: 'A', description: '' }] },
        { question: '', header: 'H', options: [{ label: 'A', description: '' }] },
        { question: 'Valid?', header: 'H', options: [{ label: 'A', description: '' }] },
      ],
    })
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0].question).toBe('Valid?')
  })

  it('skips options without a label', () => {
    const result = parseAskUserQuestionInput({
      questions: [{
        question: 'Q?',
        header: 'H',
        options: [
          { label: '', description: 'empty label' },
          { description: 'no label' },
          { label: 'Valid', description: 'good' },
        ],
        multiSelect: false,
      }],
    })
    expect(result.questions[0].options).toHaveLength(1)
    expect(result.questions[0].options[0].label).toBe('Valid')
  })

  // ─── Malformed input → empty ────────────────────────────────────

  it.each([
    [null, 'null'],
    [undefined, 'undefined'],
    ['string', 'string'],
    [42, 'number'],
    [{}, 'object without questions'],
    [{ questions: 'not-array' }, 'questions is string'],
    [{ questions: null }, 'questions is null'],
    [{ questions: [null, 42, 'str'] }, 'questions array with non-objects'],
  ] as const)('malformed input %p (%s) → empty questions', (input, _desc) => {
    expect(parseAskUserQuestionInput(input).questions).toEqual([])
  })
})
