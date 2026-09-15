// What the brain keeps outside its actors (cron jobs, ad-hoc listeners, the flow actor registry) goes when the pack's
// backend stops: default-setup's boot.onShutdown clears it, and @abuddy/testing runs it when a test's app stops, so a
// real schedule from one test never ticks into the next
import { describe, expect, it, vi } from 'vitest'
import { importFlows, startApp } from '@abuddy/testing/harness'
import { testRootEvents } from '@abuddy/sdk/testing'
import { schedule, transform } from '@/__generated__/flow-helpers'
import { onShutdown } from '@/features/hooks'
import { registerSchedule } from '@/features/brain/be/services/scheduler'
import { listen, notify } from '@/features/brain/be/services/brain'
import { getAllFlowActorIds } from '@/features/brain/be/flow-system'

const EVERY_SECOND = '* * * * * *'
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("default-setup's onShutdown", () => {
  it('stops cron jobs and removes ad-hoc brain listeners', async () => {
    const tick = vi.fn()
    const heard = vi.fn()
    registerSchedule('shutdown-test:job', EVERY_SECOND, tick)
    listen('shutdown.test', heard)

    onShutdown()

    notify('shutdown.test')
    await wait(1_500)
    expect(tick).not.toHaveBeenCalled()
    expect(heard).not.toHaveBeenCalled()
  })
})

describe('a real schedule across tests', () => {
  it('ticks while its app runs', async () => {
    importFlows({ 'Every Second': { root: true, tracks: [schedule(EVERY_SECOND, [[transform('return true', { label: 'tick' })]])] } })
    const app = await startApp({ systems: ['brain', 'settings'] })
    await app.connect()

    await vi.waitFor(() => expect(app.flowTrace('Every Second').map((s) => s.label)).toContain('tick'), { timeout: 3_000, interval: 50 })
    expect(getAllFlowActorIds()).not.toEqual([])
  })

  it("doesn't tick into the next test once the harness stopped that app", async () => {
    const ticks: unknown[] = []
    const unsubscribe = testRootEvents.onIncoming((event) => {
      if (event.type === 'TRIGGER_BRAIN_EVENT') ticks.push(event)
    })
    try {
      await wait(2_200)
    } finally {
      unsubscribe()
    }
    expect(ticks).toEqual([])
    expect(getAllFlowActorIds()).toEqual([])
  })
})
