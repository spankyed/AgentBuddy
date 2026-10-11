// Creating a flow tells every window, and opens it in one.
//
// It used to be one broadcast doing both: `FLOW_CREATED` grew every window's list *and* carried
// `target: '.view'`, so every open window navigated to a flow it had not created. A flow's id is minted by
// the create, so nothing the asker sent could identify it — a keyed slot cannot settle this. Addressing can,
// and the channel already exists: the news stays a broadcast, the answer is replied to whoever asked.
//
// This file is the backend half of that split, and it is here rather than beside the terminal's identical
// split because a flow is made in memory while a terminal spawns a process. What it pins is the pair:
// the broadcast reaches everyone and the answer reaches the asker's connection alone.
import { describe, expect, it } from 'vitest'
import { startApp } from '@apack/testing/harness'

const FLOWS = 'default-setup/flows'
/** The connection the ask arrived on, which is what makes it a window's rather than the backend's */
const WINDOW = 'c-main'

/** Every message the bus carried for the flows plugin, with the address each went to */
const addressed = (app: Awaited<ReturnType<typeof startApp>>) =>
  app.emitted('flows').map((event) => event.type)

describe('creating a flow', () => {
  it('answers the window that asked, and tells every window separately', async () => {
    const app = await startApp({ systems: ['flows'] })
    await app.connect()

    await app.send('flows', { type: 'CREATE_FLOW' }, { sender: FLOWS, client: WINDOW })
    await app.nextEmit('flows', 'FLOW_OPENED')
    await app.settle()

    const types = addressed(app)
    expect(types, 'the news, which grows every list').toContain('FLOW_CREATED')
    expect(types, 'and the answer, which opens it for the asker').toContain('FLOW_OPENED')
  })

  /**
   * The half that cannot collapse into the other.
   *
   * A create made with nobody asking — an applier, a migration, an action — still has to tell the windows a
   * flow exists. It simply has no one to open it for.
   */
  it('still tells every window when nobody asked, and opens it for no one', async () => {
    const app = await startApp({ systems: ['flows'] })
    await app.connect()

    await app.send('flows', { type: 'CREATE_FLOW' })
    await app.nextEmit('flows', 'FLOW_CREATED')
    await app.settle()

    expect(addressed(app).filter((type) => type === 'FLOW_OPENED'), 'nobody to answer').toEqual([])
  })
})
