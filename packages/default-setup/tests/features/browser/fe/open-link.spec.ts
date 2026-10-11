// A link handed to the browser plugin goes where this feature's own settings say: a tab of its own, or the
// system's browser. Both branches are the setting being read — the thing that broke when a feature's
// settings stopped reaching its plugin — so the assertion is which of the two the plugin reached for.
import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { createActor } from 'xstate'
import { startFeTestRuntime } from '@apack/sdk/testing'
import browserState from '#features/browser/fe/state.ts'

vi.hoisted(() => { (globalThis as { addEventListener?: unknown }).addEventListener ??= () => {} })

/** What the plugin asked the shell to do, which is where `openPlugin` sends */
let asked: unknown[]
/** What it handed the system's browser instead */
let external: string[]

afterAll(startFeTestRuntime({
  client: { send() {} },
  application: {
    getSnapshot: () => ({ context: {}, hasTag: () => false }),
    send: (event: unknown) => asked.push(event),
    system: { get: () => undefined },
    subscribe: () => ({ unsubscribe() {} }),
  } as never,
}))

beforeEach(() => {
  asked = []
  external = []
  ;(globalThis as { window?: unknown }).window ??= globalThis
  ;(globalThis as unknown as { electronAPI: unknown }).electronAPI =
    { shell: { openExternal: (url: string) => external.push(url) } }
})

function startBrowser(settings?: Record<string, unknown>) {
  const actor = createActor(browserState).start()
  if (settings) actor.send({ type: 'FEATURE_SETTINGS_UPDATED', settings } as never)
  return actor
}

it('opens a link in its own tab by default, which is what no setting means', () => {
  startBrowser().send({ type: 'LINK.OPEN', url: 'https://example.test/a' })

  expect(asked).toEqual([{
    type: 'OPEN_PLUGIN',
    plugin: 'default-setup/browser',
    events: [{ type: 'TAB.CREATE', url: 'https://example.test/a' }],
  }])
  expect(external).toEqual([])
})

it("hands it to the system's browser when the setting says so, asking the shell for nothing", () => {
  startBrowser({ openLinksInApp: false }).send({ type: 'LINK.OPEN', url: 'https://example.test/b' })

  expect(external).toEqual(['https://example.test/b'])
  expect(asked).toEqual([])
})
