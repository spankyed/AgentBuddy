// @apackdev/testing's mockService lasts for the test it's made in: made in a beforeEach it applies to each test,
// and made where no test runs (beforeAll, module scope) it fails instead of silently lapsing after the first test
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockService } from '@apackdev/testing/harness'
import { services } from '#generated/services.ts'

const scripted = { clearAllSchedules: vi.fn() }

describe('mockService in beforeEach', () => {
  beforeEach(() => {
    scripted.clearAllSchedules.mockClear()
    mockService('scheduler', scripted)
  })

  it('applies to the first test', () => {
    services.scheduler.clearAllSchedules()
    expect(scripted.clearAllSchedules).toHaveBeenCalledTimes(1)
  })

  it('applies to the next test', () => {
    services.scheduler.clearAllSchedules()
    expect(scripted.clearAllSchedules).toHaveBeenCalledTimes(1)
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
    scripted.clearAllSchedules.mockClear()
    services.scheduler.clearAllSchedules()
    expect(scripted.clearAllSchedules).not.toHaveBeenCalled()
  })
})
