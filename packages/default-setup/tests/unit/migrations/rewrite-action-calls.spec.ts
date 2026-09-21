// A 0.3.14 action's calls to services 0.3.15 changed, rewritten in the code the user wrote
import { describe, expect, it } from 'vitest'
import { rewriteActionCalls } from '../../../src/migrations/rewrite-action-calls'

const rewrite = (code: string) => rewriteActionCalls(code, { packId: 'default-setup', bareIds: ['threads', 'code', 'brain'] })

describe('rewriteActionCalls', () => {
  it("names this pack's features by ref, whichever quotes the code used", () => {
    expect(rewrite(`services.emitter.sendToPlugin('threads', { type: 'SET_PHASE' });`))
      .toBe(`services.emitter.sendToPlugin('default-setup/threads', { type: 'SET_PHASE' });`)
    expect(rewrite(`services.emitter.sendToSystem("brain", e);`)).toBe(`services.emitter.sendToSystem("default-setup/brain", e);`)
    expect(rewrite('const s = services.repository.settingsQueries.getPluginSettings(`code`);'))
      .toBe('const s = services.repository.settingsQueries.getPluginSettings(`default-setup/code`);')
    expect(rewrite(`services.settings.updatePluginSetting( 'code', ['baseDirectory'], dir);`))
      .toBe(`services.settings.updatePluginSetting( 'default-setup/code', ['baseDirectory'], dir);`)
  })

  it("names the app's plugin by its ref, and leaves names it doesn't know alone", () => {
    expect(rewrite(`services.emitter.sendToPlugin('application', e);`)).toBe(`services.emitter.sendToPlugin('host/application', e);`)
    const untouched = `services.emitter.sendToPlugin('other-pack/memos', e); services.emitter.sendToPlugin(target, e); services.emitter.sendToPlugin('unknown', e);`
    expect(rewrite(untouched)).toBe(untouched)
  })

  it('sends a flow event to the brain role, keeping the event however it was written', () => {
    const code = [
      'services.emitter.sendToBrainSystem({',
      "  eventType: 'reply',",
      '  payload: { text: `done (${items.map((i) => i.name).join(", ")})`, note: ")" },',
      '}); // a ) in a comment',
      'services.emitter.sendToBrainSystem(event);',
    ].join('\n')
    expect(rewrite(code)).toBe([
      "services.emitter.sendToSystem({ role: 'brain' }, { type: 'TRIGGER_BRAIN_EVENT', ...({",
      "  eventType: 'reply',",
      '  payload: { text: `done (${items.map((i) => i.name).join(", ")})`, note: ")" },',
      '}) }); // a ) in a comment',
      "services.emitter.sendToSystem({ role: 'brain' }, { type: 'TRIGGER_BRAIN_EVENT', ...(event) });",
    ].join('\n'))
  })

  it('leaves a brain send it cannot find the end of', () => {
    const code = 'services.emitter.sendToBrainSystem({ eventType: "x"'
    expect(rewrite(code)).toBe(code)
  })

  it('reads and completes onboarding through the app', () => {
    expect(rewrite('if (services.settings.getInternalSettings().hasOnboarded) return;'))
      .toBe('if (({ hasOnboarded: services.appData.hasOnboarded() }).hasOnboarded) return;')
    expect(rewrite(`services.settings.updateInternalSetting(["hasOnboarded"], true);`)).toBe('services.appData.completeOnboarding();')
  })

  it('changes nothing in code that already uses the current calls', () => {
    const current = `services.emitter.sendToSystem({ role: 'brain' }, { type: 'TRIGGER_BRAIN_EVENT', eventType: 'x' }); services.emitter.sendToPlugin('default-setup/threads', e);`
    expect(rewrite(current)).toBe(current)
  })
})
