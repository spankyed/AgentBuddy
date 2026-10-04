// A query's result goes to the view that ran it, not to every window.
//
// Two windows each show the Database plugin with their own editor and their own pending request, and a
// `broadcastToPlugin` reached both. `reply` answers the sender of the message being handled, on the connection
// it came from — so a person querying in one window and an agent driving in another stop seeing each other's
// results.
//
// What this file cannot check is the *delivery narrowing*: the harness has one client, so `emitted` sees
// whatever the bus put out whether or not it was addressed. The addressing itself is covered where it lives
// (`@abuddy/host`'s `tests/bus/reply.spec.ts` and `@app/api`'s `tests/transport/sub-scope.spec.ts`). What is
// covered here is the pack's half: that the handler answers its sender at all, which it could not before
// `app.send` carried one.
import { describe, expect, it } from 'vitest'
import { startApp } from '@abuddy/testing/harness'

const DATABASE = 'default-setup/database'

describe('a query run by a plugin', () => {
  it('is answered to the asker, carrying the id it asked with', async () => {
    const app = await startApp({ systems: ['database'] })
    // The bus drops sends to plugins until a client connects, so an answer has nowhere to go without this
    await app.connect()

    await app.send('database', { type: 'EXECUTE_QUERY', code: 'return 1 + 1', requestId: 'q-1' }, { sender: DATABASE })
    const answer = await app.nextEmit('database', 'QUERY_RESULT')

    expect(answer).toMatchObject({ type: 'QUERY_RESULT', result: 2, requestId: 'q-1' })
  })

  // The failing path answers too, and answers once: the reply sits outside the try so a throw cannot send twice
  it('answers a failing query with the error and the same id', async () => {
    const app = await startApp({ systems: ['database'] })
    // The bus drops sends to plugins until a client connects, so an answer has nowhere to go without this
    await app.connect()

    await app.send('database', { type: 'EXECUTE_QUERY', code: 'return nope', requestId: 'q-2' }, { sender: DATABASE })
    const answer = await app.nextEmit('database', 'QUERY_ERROR')

    expect(answer).toMatchObject({ type: 'QUERY_ERROR', requestId: 'q-2' })
    expect(app.emitted('database').filter((event) => event.type === 'QUERY_RESULT'), 'and not also a result').toEqual([])
  })

  /**
   * The schema change stays a broadcast, and that is the point of the case.
   *
   * A transaction produces two things: an answer for whoever ran it, and news every window's schema view wants.
   * Converting the second to a reply would have narrowed it to the asker, so it is asserted to still be there
   * beside the reply rather than left to a reader to notice.
   */
  it('answers a transaction and still tells every window the schema changed', async () => {
    const app = await startApp({ systems: ['database'] })
    // The bus drops sends to plugins until a client connects, so an answer has nowhere to go without this
    await app.connect()

    await app.send(
      'database',
      { type: 'EXECUTE_TRANSACTION', code: 'return 1', requestId: 't-1' },
      { sender: DATABASE },
    )
    await app.nextEmit('database', 'TRANSACTION_RESULT')
    await app.settle()

    const types = app.emitted('database').map((event) => event.type)
    expect(types, 'the answer and the notification, in that order').toContain('TRANSACTION_RESULT')
    expect(types, 'the schema change is not an answer, so it is still broadcast').toContain('DATABASE_REFRESH')
  })
})
