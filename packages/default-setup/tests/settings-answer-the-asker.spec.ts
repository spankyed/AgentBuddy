// A settings write is answered to whoever asked for it, not to the Settings view of every window.
//
// `SETTINGS_SAVED` and `SETTINGS_REFUSED` were only ever broadcast to the `settings` plugin, which meant a
// sender that was not that plugin learned nothing: a drive session's `/set-setting` reported success for
// every refused write, because the send had been accepted and the refusal went somewhere it could not see.
// `/query` had made the opposite bargain since it existed, which is what left this one looking like it worked.
//
// Reply **or** broadcast, never both. Replying as well would hand the Settings view two `SETTINGS_SAVED` for
// one save; and the reply is the better of the two for it anyway, since the broadcast told every window's view
// that something it never did had been saved.
//
// **Which of the two arms ran is what this file checks, and the address is not how.** The harness resolves a
// `sender` against registered systems, so a driver's ref cannot be named here, and naming the Settings plugin
// makes a reply and a broadcast arrive at the same *place*. What tells them apart is `Message.answering`,
// which only `reply` stamps: `nextEmit`'s `answering` waits for the answer to one ask, so a broadcast of the
// same type does not satisfy it. Checked by mutation: with `answerSettings`' reply arm deleted, the three
// cases that name a call fail and the no-sender one passes.
//
// The address itself is still watched where it can be, in `@abuddy/host`'s
// `tests/features/settings/answer.spec.ts`, which opens a delivery with `_runDelivery` and reads it.
//
// What this file covers beyond that is the rest of the path: that the real system, with the real store,
// produces an outcome at all, names the call it was asked under, puts the store's own reasons in a refusal, and
// still broadcasts the data beside the answer. The database's `reply-to-asker.spec.ts` is the same division for
// the same reason.
import { describe, expect, it } from 'vitest'
import { startApp } from '@abuddy/testing/harness'

const SETTINGS = 'host/settings'
/** The connection the ask arrived on, which is what makes an ask a window's rather than the backend's */
const WINDOW = 'c-window'

/**
 * A write that the store takes, and one it refuses, so each case says which it is asking for.
 *
 * **No correlation field on any of the three write events**, and none is wanted: `app.send` returns the call
 * it sent under and `reply` stamps it on the answer, so a helper like this has nothing to supply.
 */
const write = (label: string) => ({
  type: 'UPDATE_SETTINGS' as const,
  entityType: 'section' as const,
  label,
  path: ['application', 'theme'],
  value: 'dark',
})

describe('a settings write from a window', () => {
  it('produces an outcome naming the call it was asked under', async () => {
    const app = await startApp({ systems: ['host/settings'] })
    await app.connect()

    const call = await app.send(SETTINGS, write('general'), { sender: SETTINGS, client: WINDOW })
    const answer = await app.nextEmit(SETTINGS, 'SETTINGS_SAVED', { answering: call })

    expect(answer).toMatchObject({ type: 'SETTINGS_SAVED' })
  })

  /**
   * The case the whole change exists for: a refusal reaches whoever asked, with the store's own reasons.
   *
   * `problems` rather than one `error`, because a document can be wrong in more than one place — which is why
   * the drive session reads either shape.
   */
  it('answers a refused write with the reasons, and stores nothing', async () => {
    const app = await startApp({ systems: ['host/settings'] })
    await app.connect()

    const call = await app.send(SETTINGS, write('not-a-section'), { sender: SETTINGS, client: WINDOW })
    const answer = await app.nextEmit(SETTINGS, 'SETTINGS_REFUSED', { answering: call })

    expect(answer).toMatchObject({ type: 'SETTINGS_REFUSED' })
    expect((answer as unknown as { problems: string[] }).problems.join(' ')).toContain('not-a-section')
    expect(app.emitted(SETTINGS).filter((event) => event.type === 'SETTINGS_SAVED'), 'and not also a save')
      .toEqual([])
  })

  // The data is news for every window; only the outcome is an answer. Converting both would have narrowed the
  // one that every Settings view needs, so it is asserted beside the answer rather than left to be noticed.
  it('answers, and still tells every window the settings changed', async () => {
    const app = await startApp({ systems: ['host/settings'] })
    await app.connect()

    const call = await app.send(SETTINGS, write('general'), { sender: SETTINGS, client: WINDOW })
    await app.nextEmit(SETTINGS, 'SETTINGS_SAVED', { answering: call })
    await app.settle()

    const types = app.emitted(SETTINGS).map((event) => event.type)
    expect(types, 'the data is not an answer, so it is still broadcast').toContain('SETTINGS_UPDATED')
  })
})

describe('a settings write with no sender', () => {
  /**
   * The fallback, and the reason it is reply-*or*-broadcast rather than reply-*and*-broadcast.
   *
   * A write can arrive from code with no delivery in scope at all, and `reply()` throws for one of those. The
   * Settings view has to hear it either way, so the broadcast stays as the answer for an ask that named nobody.
   */
  it('still tells the Settings view, since there is nobody to answer', async () => {
    const app = await startApp({ systems: ['host/settings'] })
    await app.connect()

    const call = await app.send(SETTINGS, write('general'))
    // Waited for by type alone, because this arm answers nothing — and then asserted to answer nothing, which
    // is what tells this case apart from the three above rather than leaving it to read the same
    const answer = await app.nextEmit(SETTINGS, 'SETTINGS_SAVED')

    expect(answer).toMatchObject({ type: 'SETTINGS_SAVED' })
    await expect(app.nextEmit(SETTINGS, 'SETTINGS_SAVED', { answering: call, timeoutMs: 100 }))
      .rejects.toThrow(/No SETTINGS_SAVED answering/)
  })
})
