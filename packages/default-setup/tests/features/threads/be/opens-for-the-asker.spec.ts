// Opening a thread reaches the window that opened it, and the news beside it reaches all of them.
//
// Both halves were broadcast, so clicking a thread in one window pulled **every** window onto it: each one
// loaded that thread's chat, set it as current, and then asked for its own tab — and each of those answers
// went to all the windows again. A window showing thread Y was yanked to thread X by someone else's click.
//
// The split is the point, and it is what the last two cases pin. `LOAD_CHAT_THREAD` and
// `THREAD_TAB_REQUESTED` are the asker's; `REFRESH_RECENT_THREADS` is news — the list changed for everyone,
// because the thread was marked visited. Put either answer back on a broadcast and a case here fails.
import { beforeEach, describe, expect, it } from 'vitest'
import { testRootEvents } from '@apack/sdk/testing'
import { startApp } from '@apack/testing/harness'
import { repository } from '#generated/repository.ts'

const THREADS = 'default-setup/threads'
/** The connection an ask arrived on, which is what makes it a window's rather than an action's */
const MAIN = 'c-main'

/**
 * Every message the bus carried to a plugin, with the connection it was addressed to.
 *
 * `app.emitted()` hands back the events alone, and the whole subject here is `Message.client` — a broadcast
 * and an answer are the same event and differ only in where they went.
 */
let sent: Array<{ type: string; client?: string }>
let stop: () => void

beforeEach(() => {
  sent = []
  stop?.()
  stop = testRootEvents.onPluginSend((message) => {
    if (message.to === THREADS) sent.push({ type: message.event.type, client: message.client })
  })
})

const clientsFor = (type: string) => sent.filter((m) => m.type === type).map((m) => m.client)

describe('opening a thread', () => {
  it('loads the chat for the window that asked, and no other', async () => {
    const app = await startApp({ systems: ['threads'] })
    await app.connect()
    const { id } = repository.threadCommands.create({ topic: 'Asked for', instructions: '' })

    await app.send('threads', { type: 'OPEN_THREAD_CHAT', threadId: id }, { sender: THREADS, client: MAIN })
    await app.nextEmit('threads', 'LOAD_CHAT_THREAD')
    await app.settle()

    expect(clientsFor('LOAD_CHAT_THREAD'), 'one connection, not every window').toEqual([MAIN])
  })

  /**
   * The fallback, and why it is reply-*or*-broadcast rather than a bare `reply?.()`.
   *
   * Ten of the fourteen callers that open a thread chat are action code — onboarding, a session restore, a
   * summarise — which runs a tick after whatever triggered it and so has no sender to answer. Every window
   * showing threads should follow those, and this is the case that says so.
   */
  it('loads it for every window when nobody asked, which is what an action gets', async () => {
    const app = await startApp({ systems: ['threads'] })
    await app.connect()
    const { id } = repository.threadCommands.create({ topic: 'Opened by an action', instructions: '' })

    await app.send('threads', { type: 'OPEN_THREAD_CHAT', threadId: id })
    await app.nextEmit('threads', 'LOAD_CHAT_THREAD')
    await app.settle()

    expect(clientsFor('LOAD_CHAT_THREAD'), 'absent means every connection').toEqual([undefined])
  })

  // A tab is one window's: its own list, persisted in its own storage, so there is no news half for it
  it('opens the tab in the window that asked', async () => {
    const app = await startApp({ systems: ['threads'] })
    await app.connect()
    const { id } = repository.threadCommands.create({ topic: 'A tab', instructions: '' })

    await app.send('threads', { type: 'OPEN_THREAD_TAB', threadId: id, label: 'A tab' }, { sender: THREADS, client: MAIN })
    await app.nextEmit('threads', 'THREAD_TAB_REQUESTED')
    await app.settle()

    expect(clientsFor('THREAD_TAB_REQUESTED')).toEqual([MAIN])
  })

  /**
   * The half that must stay a broadcast, which is what makes this a split rather than a blanket change.
   *
   * Opening a thread marks it visited, so the recent list changed for everyone. Answering this one would
   * leave every other window's list stale — the mirror of the bug the other cases fix.
   */
  it('tells every window the recent list changed, even though one window asked', async () => {
    const app = await startApp({ systems: ['threads'] })
    await app.connect()
    const { id } = repository.threadCommands.create({ topic: 'Visited', instructions: '' })

    await app.send('threads', { type: 'OPEN_THREAD_TAB', threadId: id, label: 'Visited' }, { sender: THREADS, client: MAIN })
    await app.nextEmit('threads', 'REFRESH_RECENT_THREADS')
    await app.settle()

    expect(clientsFor('REFRESH_RECENT_THREADS'), 'news goes to all of them').toEqual([undefined])
  })
})
