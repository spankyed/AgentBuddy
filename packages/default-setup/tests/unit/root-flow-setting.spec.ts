// The flows plugin's `rootFlowId` setting follows the flow with the root role: the SDK's flow repository grants the
// role, and the pack keeps its setting in step when flows are imported, directly or as pack seeds from Settings
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileFlowDSL } from '@abuddy/sdk/build'
import { flowRepository } from '@abuddy/sdk/ears'
import { startApp } from '@abuddy/testing/harness'
import { repository } from '@/__generated__/repository'

const DIST = path.resolve(import.meta.dirname, '../../dist')
const rootFlowSetting = () => repository.settingsQueries.getPluginSettings('flows')?.rootFlowId

describe("the flows plugin's root flow setting", () => {
  it('names the root flow imported from DSL', () => {
    repository.flowsCommands.importFromDSL(compileFlowDSL({ 'Main': { root: true, tracks: [{ event: 'flow.entry', exits: [[]] }] } }))

    expect(flowRepository.rootFlow()).toBeDefined()
    expect(rootFlowSetting()).toBe(flowRepository.rootFlow())
  })

  it('names the root flow a pack seed import brought', async () => {
    const app = await startApp({ systems: ['brain', 'settings'] })
    await app.connect()
    await app.send('settings', { type: 'IMPORT_PACK_SEEDS', directory: DIST, include: { flows: null, actions: null, prompts: null }, mode: 'replace-on-collision', restartBrain: false })
    await app.nextEmit('settings', 'PACK_SEEDS_IMPORTED')

    expect(flowRepository.rootFlow()).toBeDefined()
    expect(rootFlowSetting()).toBe(flowRepository.rootFlow())
  })
})
