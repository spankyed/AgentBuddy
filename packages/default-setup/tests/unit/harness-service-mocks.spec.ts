// @abuddy/testing's mockService lasts for the test it's made in: made in a beforeEach it applies to each test,
// and made where no test runs (beforeAll, module scope) it fails instead of silently lapsing after the first test
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mockService } from '@abuddy/testing/harness'
import { services } from '@/__generated__/services'

const scripted = { clearAllSchedules: () => {} }

describe('mockService in beforeEach', () => {
  beforeEach(() => mockService('scheduler', scripted))

  it('applies to the first test', () => {
    expect(services.scheduler).toBe(scripted)
  })

  it('applies to the next test', () => {
    expect(services.scheduler).toBe(scripted)
  })
})

describe('mockService outside a test', () => {
  let failure: unknown
  beforeAll(() => {
    try {
      mockService('scheduler', scripted)
    } catch (error) {
      failure = error
    }
  })

  it('fails naming where to make the mock', () => {
    expect(String(failure)).toContain("mockService('scheduler') ran outside a test")
    expect(services.scheduler).not.toBe(scripted)
  })
})
