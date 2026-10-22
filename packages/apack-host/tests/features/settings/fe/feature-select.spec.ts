// The settings surface shows the settings of the surface FEATURE.SELECT names. Any pack can send it (with
// openSurface), so it takes a feature's ref: a bare name would be read as this pack's surface. A bad one is reported
// and ignored, rather than stopping the settings surface.
import { afterAll, afterEach, expect, it, vi } from 'vitest'
import { createActor } from 'xstate'
import { startFeTestRuntime } from '@apackdev/sdk/testing'
import { createSettingsMachine } from '../../../../src/features/settings/fe/machine.ts'
import { resolveName } from '@apackdev/sdk/ids'

afterAll(startFeTestRuntime({ client: { send() {} } }))
afterEach(() => vi.restoreAllMocks())

function readySettingsSurface() {
  const actor = createActor(createSettingsMachine({ reset: async () => {}, restart: () => {}, report: () => {} })).start()
  return actor
}

it('selects the surface a ref names', () => {
  const actor = readySettingsSurface()
  actor.send({ type: 'FEATURE.SELECT', featureId: resolveName('e2e-fixture/memos') })
  expect(actor.getSnapshot().context.selectedFeatureId).toBe('e2e-fixture/memos')
})

it('ignores and reports a bare name, keeping what was selected and running on', () => {
  const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
  const actor = readySettingsSurface()
  actor.send({ type: 'FEATURE.SELECT', featureId: resolveName('default-setup/logs') })

  actor.send({ type: 'FEATURE.SELECT', featureId: 'memos' as never })

  expect(actor.getSnapshot().context.selectedFeatureId).toBe('default-setup/logs')
  expect(actor.getSnapshot().status).toBe('active')
  expect(reported).toHaveBeenCalledWith(expect.stringContaining(`"memos", which isn't a feature's ref`))
})
