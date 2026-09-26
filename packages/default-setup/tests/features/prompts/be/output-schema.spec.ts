// The prompts plugin's form sends a prompt's output schema with its other fields: the prompts system stores it
// when the prompt is created, updated or imported
import { describe, expect, it } from 'vitest'
import { startApp } from '@abuddy/testing/harness'
import { repository } from '@/__generated__/repository'
import type { EARS } from '@/__generated__/ears'

const schema = { type: 'object', properties: { summary: { type: 'string' } } }
const byLabel = (label: string) => repository.promptQueries.byLabel(label)

const promptsApp = async () => {
  const app = await startApp({ systems: ['prompts'] })
  await app.connect()
  return app
}

describe('a prompt\'s output schema', () => {
  it('is stored when the prompt is created and updated', async () => {
    const app = await promptsApp()
    await app.send('prompts', { type: 'CREATE_PROMPT', label: 'Summarize', inputs: {}, templateFn: 'return "hi"', outputSchema: schema })
    await app.nextEmit('prompts', 'PROMPT_CREATED')
    const created = byLabel('Summarize')!
    expect(created.outputSchema).toEqual(schema)

    const changed = { type: 'object', properties: { title: { type: 'string' } } }
    await app.send('prompts', { type: 'UPDATE_PROMPT', promptId: created.id, outputSchema: changed })
    await app.nextEmit('prompts', 'PROMPT_UPDATED')
    expect(repository.promptQueries.byId(created.id as EARS.EntityId)!.outputSchema).toEqual(changed)
  })

  it('is stored when prompts are imported', async () => {
    const app = await promptsApp()
    await app.send('prompts', { type: 'IMPORT_PROMPTS', prompts: [{ label: 'Imported', templateFn: 'return "hi"', outputSchema: schema }] })
    await app.nextEmit('prompts', 'PROMPTS_IMPORTED')
    expect(byLabel('Imported')!.outputSchema).toEqual(schema)
  })
})
