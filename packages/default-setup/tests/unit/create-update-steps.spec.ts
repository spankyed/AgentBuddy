// The create and update steps write entities with the fields their mappings resolve, as a flow on the brain runs them
import { describe, expect, it } from 'vitest'
import { importFlows, startApp } from '@abuddy/testing/harness'
import { startTestRuntime } from '@abuddy/sdk/testing'
import { create, on, update } from '@/__generated__/flow-helpers'
import { createEntityWithDefaults, findAll, findById, type EARS } from '@/__generated__/ears'
import { createStepBuild } from '@/extensions/steps/create/build'
import { updateStepBuild } from '@/extensions/steps/update/build'

const startBrain = () => startApp({ systems: ['brain'] })
const result = (step: { nodeAttributes: Record<string, unknown> }) => step.nodeAttributes.result as Record<string, unknown>
const errorMessage = (step: { nodeAttributes: Record<string, unknown> }) => (result(step).error as { message: string }).message

describe('create step', () => {
  it('creates an entity of its type with the mapped and literal fields, labelled from its title, and completes with the row', async () => {
    importFlows({
      Notes: {
        root: true,
        tracks: [on('note', [[create('Note', { label: 'add', map: { title: '$.event.data.payload.title' }, params: { content: 'body', favorite: false } })]])],
      },
    })
    const app = await startBrain()

    const run = await app.runFlow('Notes', { event: 'note', data: { title: 'Groceries' } })

    expect(run.steps.map((s) => [s.label, s.status])).toEqual([['add', 'completed']])
    const created = result(run.steps[0])
    expect(created).toMatchObject({ entityType: 'Note', title: 'Groceries', content: 'body', favorite: false, label: 'Groceries' })
    expect(findById(created.id as EARS.EntityId<'Note'>)).toMatchObject({ title: 'Groceries', content: 'body', label: 'Groceries' })
  })

  it("doesn't label the entity from its title when inferLabel is false", async () => {
    importFlows({ Notes: { root: true, tracks: [on('note', [[create('Note', { label: 'add', map: { title: '$.event.data.payload' }, inferLabel: false })]])] } })
    const app = await startBrain()

    const run = await app.runFlow('Notes', { event: 'note', data: 'Groceries' })

    expect(result(run.steps[0]).label).toMatch(/^New Note/)
  })

  it("creates an entity type the running app registered that this pack's own facade doesn't know (another pack's)", async () => {
    // Another pack registers Memo with the running app (for the rest of this file)
    startTestRuntime({ entityTypes: ['Memo'] })
    importFlows({ Memos: { root: true, tracks: [on('memo', [[create('Memo', { label: 'add', params: { title: 'From another pack' } })]])] } })
    const app = await startBrain()

    const run = await app.runFlow('Memos', { event: 'memo' })

    expect(run.steps.map((s) => [s.label, s.status])).toEqual([['add', 'completed']])
    expect(result(run.steps[0])).toMatchObject({ entityType: 'Memo', title: 'From another pack' })
  })

  it("fails naming an entity type that isn't registered, and writes nothing", async () => {
    importFlows({ Notes: { root: true, tracks: [on('note', [[create('Nope', { label: 'add', params: { title: 'x' } })]])] } })
    const app = await startBrain()
    const before = findAll('Note').length

    const run = await app.runFlow('Notes', { event: 'note' })

    expect(run.steps.map((s) => [s.label, s.status])).toEqual([['add', 'failed']])
    expect(errorMessage(run.steps[0])).toBe('Step "add" names entity type "Nope", which isn\'t a registered entity type')
    expect(findAll('Note').length).toBe(before)
  })
})

describe('update step', () => {
  it("updates the entity the previous step created, by its result's id", async () => {
    importFlows({
      Notes: {
        root: true,
        tracks: [on('note', [[
          create('Note', { label: 'add', map: { title: '$.event.data.payload' } }),
          update('$.lastStep.result.id', { label: 'change', map: { content: '$.steps[label=add].result.title' }, params: { favorite: true } }),
        ]])],
      },
    })
    const app = await startBrain()

    const run = await app.runFlow('Notes', { event: 'note', data: 'Groceries' })

    expect(run.steps.map((s) => [s.label, s.status])).toEqual([['add', 'completed'], ['change', 'completed']])
    const id = result(run.steps[0]).id as EARS.EntityId<'Note'>
    expect(result(run.steps[1])).toMatchObject({ id, updated: true, content: 'Groceries', favorite: true })
    expect(findById(id)).toMatchObject({ title: 'Groceries', content: 'Groceries', favorite: true })
  })

  it('updates an entity by a literal id', async () => {
    const note = createEntityWithDefaults('Note', { content: 'original' }).id
    importFlows({ Notes: { root: true, tracks: [on('edit', [[update(note, { label: 'change', params: { content: 'changed' } })]])] } })
    const app = await startBrain()

    await app.runFlow('Notes', { event: 'edit' })

    expect(findById(note)).toMatchObject({ content: 'changed' })
  })

  describe('onMissing', () => {
    const missing = (onMissing: 'fail' | 'ignore' | 'create' | undefined, extra: Record<string, unknown> = {}) => {
      importFlows({ Notes: { root: true, tracks: [on('edit', [[update('$.event.data.payload', { label: 'change', params: { title: 'Made' }, ...(onMissing && { onMissing }), ...extra })]])] } })
      return startBrain().then((app) => app.runFlow('Notes', { event: 'edit', data: 'Note-missing' }))
    }

    it.each([['no onMissing', undefined], ['fail', 'fail']] as const)('fails naming the id with %s', async (_, mode) => {
      const run = await missing(mode)
      expect(run.steps.map((s) => s.status)).toEqual(['failed'])
      expect(errorMessage(run.steps[0])).toBe('Update step "change": No entity has id "Note-missing"')
    })

    it('completes without writing with ignore', async () => {
      const before = findAll('Note').length
      const run = await missing('ignore')
      expect(run.steps.map((s) => [s.status, result(s)])).toEqual([['completed', { updated: false }]])
      expect(findAll('Note').length).toBe(before)
    })

    it('creates an entity of its entity type with create', async () => {
      const run = await missing('create', { entity: 'Note' })
      expect(run.steps.map((s) => s.status)).toEqual(['completed'])
      const row = result(run.steps[0])
      expect(row).toMatchObject({ entityType: 'Note', title: 'Made', updated: false, created: true })
      expect(findById(row.id as EARS.EntityId<'Note'>)).toMatchObject({ title: 'Made' })
    })
  })
})

describe('create and update build', () => {
  const compileCtx = { actions: new Map(), prompts: new Map(), flows: new Map() }
  const roundTrip = (build: typeof createStepBuild, dsl: Record<string, unknown>) =>
    build.build!.decompile!(build.build!.compile(dsl, 'Node-1', 1, compileCtx).entity, { actionMap: new Map(), promptMap: new Map(), flowMap: new Map() })

  it("round-trips update's target, fields, onMissing and entity", () => {
    const dsl = update('$.lastStep.result.id', { label: 'change', map: { content: '$.event.data.payload' }, params: { favorite: true }, onMissing: 'create', entity: 'Note' })
    expect(updateStepBuild.build!.compile(dsl, 'Node-1', 1, compileCtx).entity).toMatchObject({ target: '$.lastStep.result.id' })
    expect(roundTrip(updateStepBuild, dsl)).toEqual(dsl)
  })

  it("round-trips create's entity, fields and inferLabel", () => {
    const dsl = create('Note', { label: 'add', map: { title: '$.event.data.payload' }, params: { content: 'body' }, inferLabel: false })
    expect(roundTrip(createStepBuild, dsl)).toEqual(dsl)
  })

  it("rejects update's onMissing create without an entity type", () => {
    const ctx = { actions: new Set<string>(), prompts: new Set<string>(), flowNames: new Set<string>(), nodeLabels: new Set<string>(), path: 'p' }
    expect(updateStepBuild.build!.validate(update('$.lastStep.result.id', { onMissing: 'create' }), 'p', ctx)).toEqual([
      { path: 'p.entity', message: '"onMissing: \'create\'" needs "entity", the entity type to create' },
    ])
    expect(updateStepBuild.build!.validate(update('Note-1', { onMissing: 'create', entity: 'Note' }), 'p', ctx)).toEqual([])
  })
})
