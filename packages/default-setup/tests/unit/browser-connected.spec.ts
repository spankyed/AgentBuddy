// The bus tells every system when a client connects; a system that also listened for connections itself would send
// its plugin the startup data twice
import { expect, it } from 'vitest'
import { startApp } from '@abuddy/testing/harness'

it('sends the browser plugin its saved tabs once per connection', async () => {
  const app = await startApp({ systems: ['browser'] })

  await app.connect()
  await app.settle()

  expect(app.emitted('browser').filter((event) => event.type === 'BROWSER_CONNECTED')).toHaveLength(1)
})
