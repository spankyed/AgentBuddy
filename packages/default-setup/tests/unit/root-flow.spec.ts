// The root flow is the flow with the root role, and only that: the flows system reports it to its plugin and changes
// it (SET_ROOT_FLOW), imports and seed imports bring it with their flows, and no setting records it
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileFlowDSL } from '@abuddy/sdk/build'
import { flowRepository } from '@abuddy/sdk/repositories'
import { startApp } from '@abuddy/testing/harness'
import { repository } from '@/__generated__/repository'
import { pluginSettingsKey } from '@/features/settings/plugin-settings';

const DIST = path.resolve(import.meta.dirname, '../../dist')
const importRoot = (label: string) =>
  repository.flowsCommands.importFromDSL(compileFlowDSL({ [label]: { root: true, tracks: [{ event: 'flow.entry', exits: [[]] }] } })).flowIds[0]
const reportedRoot = (event: unknown) => (event as { data: { rootFlow?: { id: string } } }).data.rootFlow?.id

describe('the root flow', () => {
  it('is the flow with the root role, which the flows system sends its plugin, and no setting', async () => {
    const rootId = importRoot('Main')
    const app = await startApp({ systems: ['flows', 'settings'] })
    await app.connect()

    expect(reportedRoot(await app.nextEmit('flows', 'FLOWS_CONNECTED'))).toBe(rootId)
    expect(repository.settingsQueries.getPluginSettings(pluginSettingsKey('flows'))).not.toHaveProperty('rootFlowId')
  })

  it('changes with SET_ROOT_FLOW, taking the role from the previous root, and null leaves none', async () => {
    const first = importRoot('First')
    const second = repository.flowsCommands.createFlow({ label: 'Second' }).id
    const app = await startApp({ systems: ['flows', 'settings'] })
    await app.connect()
    await app.nextEmit('flows', 'FLOWS_CONNECTED')

    await app.send('flows', { type: 'SET_ROOT_FLOW', flowId: second })
    expect(flowRepository.rootFlow()).toBe(second)
    expect(reportedRoot(await app.nextEmit('flows', 'FLOWS_CONNECTED'))).toBe(second)
    expect(first).not.toBe(second)

    await app.send('flows', { type: 'SET_ROOT_FLOW', flowId: null })
    expect(flowRepository.rootFlow()).toBeUndefined()
    expect(reportedRoot(await app.nextEmit('flows', 'FLOWS_CONNECTED'))).toBeUndefined()
  })

  it('reaches the plugin when a pack seed import brought it', async () => {
    const app = await startApp({ systems: ['brain', 'settings', 'flows'] })
    await app.connect()
    await app.nextEmit('flows', 'FLOWS_CONNECTED')
    await app.send('settings', { type: 'IMPORT_PACK_SEEDS', directory: DIST, include: { flows: null, actions: null, prompts: null }, mode: 'replace-on-collision', restartBrain: false })
    await app.nextEmit('settings', 'PACK_SEEDS_IMPORTED')

    expect(flowRepository.rootFlow()).toBeDefined()
    expect(reportedRoot(await app.nextEmit('flows', 'FLOWS_CONNECTED'))).toBe(flowRepository.rootFlow())
  })
})
