// What codegen says a plugin receives and a system sends.
//
// The inbox a contract opens, the events a system declares, and what the generated pack entry records a
// plugin as receiving.
//
// One of five files split from a 1,365-line original; `_support/pack.ts` holds the fixture and why.
//
// @slow: 27 cases, every one a temp pack and a full codegen pass — the file 5.7-9.0s
// Every case mkdtemps a pack and removes it (`setupPackFixture`) and runs `generatePackFiles` over a
// fresh manifest, so the cost is the work rather than the test, and it is per case rather than per file —
// which is why splitting the original by subject moved the three compiling cases into `compiles.spec.ts`
// and left the pure ones costing what they cost. `goal-one-job-pool.md` Phase 5 has the boundary.
//
// The range is the span across runs rather than noise: a pool spreads across workers, so these read
// faster when fewer projects run beside them — measured 2026-10-06, this file was at the low end in a
// two-project run and the high end in an eleven-project one. Which is why the count is the durable
// figure here and a per-case millisecond is not.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { setupPackFixture, dependency, facade, generate, pluginWithContract, receives, root, system, withPlugin, withPluginState, write, writeContract, writePluginEntry, writeSystemEntry } from './_support/pack.ts';

setupPackFixture();

describe('generated events', () => {
  it('keys each plugin by its own system\'s events and the inbox it declares', () => {
    const files = generate({ features: [withPlugin(system('actions')), withPlugin(system('flows'), "{ type: 'FLOW.SELECT' }")] });
    const events = files['src/__generated__/events.ts'];
    // A plugin that declares nothing takes only what its own feature's system sends it
    expect(events).toContain("'actions': __events_actions | __accepts_actions;");
    expect(events).toContain("'flows': __events_flows | __accepts_flows;");
    // What a dependent may send is the `public` audience alone: not the events between a feature's own halves, and
    // not the `pack` audience either, which is what this pack's features send each other
    expect(events).toContain("export type PackPluginEvents = {");
    expect(events).toContain("  'flows': __public_flows;");
    // Every host plugin is sendable, as every dependency's system already is: the owner's declaration is the contract
    expect(events).toContain("export type QualifiedPluginEvents = Qualified<'demo-pack', OwnPluginEvents> & HostPluginEvents;");
    expect(events).toContain("export type SendablePluginEvents = WithOwnNames<'demo-pack', QualifiedPluginEvents>;");
  });

  it('records in the pack entry what each own plugin receives: its system\'s events and its declared inbox', () => {
    const files = generate({ features: [withPlugin(system('actions')), withPlugin(system('flows'), "{ type: 'FLOW.SELECT' } | { type: 'FLOW.OPEN' }")] });
    expect(receives(files, 'actions')).toEqual(['ACTIONS_CONNECTED', 'ACTIONS_UPDATED']);
    // sorted and deduplicated across both halves
    expect(receives(files, 'flows')).toEqual(['FLOWS_CONNECTED', 'FLOWS_UPDATED', 'FLOW.OPEN', 'FLOW.SELECT'].sort());
  });

  // `{ type: 'A' | 'B' }` is one member covering two event types, a legal way to write an event whose
  // payload is the same either way — the style StepEvent already uses. Reading only single literals
  // rejected it, failing the build on a declaration nothing else objects to.
  it("expands a member whose `type` is a union of literals", () => {
    writeSystemEntry('jobs', "{ type: 'CANCEL' | 'COMPLETE'; id: string } | { type: 'JOBS_CONNECTED' }");
    expect(receives(generate({ features: [withPlugin(system('jobs'))] }), 'jobs')).toEqual(['CANCEL', 'COMPLETE', 'JOBS_CONNECTED']);
  });

  it('still refuses a member whose `type` is not a literal at all', () => {
    writeSystemEntry('loose', '{ type: string }');
    expect(() => generate({ features: [withPlugin(system('loose'))] }))
      .toThrow(/Feature "loose": .*`type` is string, not a string literal or a union of them/);
  });

  // The spec is the one place a system's sent events are declared: no second, named union can drift from it
  it("reads the events from the spec, whatever else the entry exports", () => {
    writeSystemEntry('memos', "{ type: 'MEMO_SAVED' }");
    fs.appendFileSync(path.join(root, 'src/features/memos/be/system.ts'), "export type OutgoingMemosEvents = { type: 'STALE' };\n");
    expect(receives(generate({ features: [withPlugin(system('memos'))] }), 'memos')).toEqual(['MEMO_SAVED']);
  });

  it('records no events for a system whose spec sends none', () => {
    writeSystemEntry('quiet', 'never');
    expect(receives(generate({ features: [withPlugin(system('quiet'))] }), 'quiet')).toEqual([]);
  });

  // These four replace the defences the phantom read needed: an entry annotated `: SystemEntry`, an entry whose
  // spec lost its events, a spec whose import didn't resolve, and an entry with no default export. Codegen no
  // longer reads the default export at all, so none of those is a failure any more — what can go wrong now is
  // that the contract the manifest names isn't there, or isn't a type.
  it('refuses a system contract the module does not declare, naming the type it looked for', () => {
    const entry = 'src/features/typed/be/system.ts';
    write(entry, 'export default { spec: undefined as never, machine: undefined as never };\n');
    write('src/features/typed/be/contract.ts', 'export type Other = { outgoing: { type: \'X\' } };\n');
    expect(() => generate({ features: [withPlugin({ id: 'typed', system: { entry, contract: 'src/features/typed/be/contract.ts#Contract' } })] }))
      .toThrow(/Feature "typed": system\.contract: .*doesn't export "Contract"/);
  });

  it('refuses a system contract the module exports only as a value', () => {
    const entry = 'src/features/valued/be/system.ts';
    write(entry, 'export default { spec: undefined as never, machine: undefined as never };\n');
    write('src/features/valued/be/contract.ts', 'export const Contract = { outgoing: {} };\n');
    expect(() => generate({ features: [withPlugin({ id: 'valued', system: { entry, contract: 'src/features/valued/be/contract.ts#Contract' } })] }))
      .toThrow(/only as a value, not a type/);
  });

  it('refuses a contract that declares no outgoing events, rather than publishing an empty system', () => {
    const entry = 'src/features/mute/be/system.ts';
    write(entry, 'export default { spec: undefined as never, machine: undefined as never };\n');
    write('src/features/mute/be/contract.ts', "export type Contract = { incoming: { type: 'GO' } };\n");
    expect(() => generate({ features: [withPlugin({ id: 'mute', system: { entry, contract: 'src/features/mute/be/contract.ts#Contract' } })] }))
      .toThrow(/declares no `outgoing` events/);
  });

  // The inbox half of the refusal above. It went without one until 2026-09-27: a declared audience that accepted
  // nothing published an audience nothing may send to, and the pack built green — while the same mistake in a
  // system's `outgoing` threw. Asked before adding it: `npm run compile`, both fixture packs and this suite were
  // green with the check in, so nothing in the tree relied on the old behaviour.
  it('refuses an audience that accepts no events, rather than publishing an inbox nothing may send to', () => {
    const plugin = pluginWithContract('src/features/sidebar/fe/index.ts', 'never');
    expect(() => generate({ features: [{ id: 'sidebar', plugin }] }))
      .toThrow(/inbox declares `public` and it accepts no events/);
  });

  // The two shapes that are not that, and must keep working: no inbox at all, and a real one
  it('reads a plugin with no inbox as accepting only its own system\'s events', () => {
    const plugin = pluginWithContract('src/features/quiet/fe/index.ts');
    expect(() => generate({ features: [{ id: 'quiet', plugin }] })).not.toThrow();
  });

  // A system that sends nothing names no contract at all; its plugin then receives only what it declares itself
  it('reads a system with no contract as sending nothing', () => {
    const entry = 'src/features/quiet2/be/system.ts';
    write(entry, 'export default { spec: undefined as never, machine: undefined as never };\n');
    const files = generate({ features: [withPlugin({ id: 'quiet2', system: { entry } }, "{ type: 'POKE' }")] });
    expect(receives(files, 'quiet2')).toEqual(['POKE']);
  });

  it('records nothing for a plugin no system sends to, so a send there is rejected', () => {
    const files = generate({ features: [withPlugin(system('actions')), withPlugin({ id: 'viewer', plugin: { entry: writePluginEntry('src/features/viewer/fe/index.ts') } })] });
    expect(receives(files, 'actions')).toEqual(['ACTIONS_CONNECTED', 'ACTIONS_UPDATED']);
    expect(receives(files, 'viewer')).toEqual([]);
  });

  it('records only this pack\'s own plugins: a dependency\'s and the host\'s are their owners\' to declare', () => {
    const deps = { 'base-pack': dependency({ features: [{ id: 'memos', system: { entry: 'x' }, plugin: { entry: writePluginEntry('y') } }] }, facade({ PackPluginEvents: "{ memos: { type: 'MEMO_ADDED' } }" })) };
    const files = generate({ dependencies: { 'base-pack': '1.0.0' }, features: [withPlugin(system('actions'))] }, deps);
    expect(receives(files, 'actions')).toEqual(['ACTIONS_CONNECTED', 'ACTIONS_UPDATED']);
    // The pack entry carries its own features only: nothing there declares what another's plugin receives
    expect(files['src/__generated__/pack-entry.ts']).not.toMatch(/'(base-pack\/memos|memos|host\/application)': \{/);
  });


  it('gives a feature with a system but no plugin no key: nothing could receive the events', () => {
    const files = generate({ features: [withPlugin(system('actions')), system('worker')] });
    const events = files['src/__generated__/events.ts'];
    expect(events).toContain("'actions': __events_actions | __accepts_actions;");
    expect(events).not.toContain("'worker': __events_worker | __accepts_worker;");
  });


  it('keys a plugin-only feature by the inbox it declares, with no system of its own', () => {
    const plugin = pluginWithContract('src/features/sidebar/fe/index.ts', "{ type: 'SIDEBAR.TOGGLE' }");
    const files = generate({ features: [system('memos'), { id: 'sidebar', plugin }] });
    expect(files['src/__generated__/events.ts']).toContain("'sidebar': __accepts_sidebar;");
    expect(receives(files, 'sidebar')).toEqual(['SIDEBAR.TOGGLE']);
  });

  // The contract is read as a declared type. A name exported only as a value is the mistake worth catching: the
  // old reader's opposite check — an `accepts` exported only as a type — went with the phantom it read.
  it('refuses a contract the module exports only as a value', () => {
    const entry = writePluginEntry('src/features/sidebar/fe/index.ts');
    write('src/features/sidebar/fe/contract.ts', 'export const Contract = { state: {} };\n');
    expect(() => generate({ features: [system('memos'), { id: 'sidebar', plugin: { entry, contract: 'src/features/sidebar/fe/contract.ts#Contract' } }] }))
      .toThrow(/only as a value, not a type/);
  });

  it('refuses a contract the module does not declare, naming the type it looked for', () => {
    const entry = writePluginEntry('src/features/sidebar/fe/index.ts');
    write('src/features/sidebar/fe/contract.ts', 'export type Other = { state: {} };\n');
    expect(() => generate({ features: [system('memos'), { id: 'sidebar', plugin: { entry, contract: 'src/features/sidebar/fe/contract.ts#Contract' } }] }))
      .toThrow(/doesn't export "Contract"/);
  });

  it('refuses an inbox opened to an audience that does not exist', () => {
    const entry = writePluginEntry('src/features/sidebar/fe/index.ts');
    write('src/features/sidebar/fe/contract.ts', "export type Contract = { state: {}; inbox: { publik: { type: 'X' } } };\n");
    expect(() => generate({ features: [system('memos'), { id: 'sidebar', plugin: { entry, contract: 'src/features/sidebar/fe/contract.ts#Contract' } }] }))
      .toThrow(/is not an audience/);
  });

  // A plugin may publish state and take nothing: its own system's events still reach it
  it('reads a contract with no inbox as receiving only its own system events', () => {
    const entry = writePluginEntry('src/features/sidebar/fe/index.ts');
    const contract = writeContract('src/features/sidebar/fe/contract.ts');
    const files = generate({ features: [{ ...system('sidebar'), plugin: { entry, contract } }] });
    expect(receives(files, 'sidebar')).toEqual(['SIDEBAR_CONNECTED', 'SIDEBAR_UPDATED']);
  });

  it("keys a dependency's plugin that declares nothing to never, so no send to it compiles", () => {
    const deps = { 'base-pack': dependency({ features: [{ id: 'memos', plugin: { entry: 'y' } }] }, facade({ PackPluginEvents: '{ memos: never }' })) };
    const files = generate({ dependencies: { 'base-pack': '1.0.0' }, features: [withPlugin(system('actions'))] }, deps);
    expect(files['src/__generated__/deps/base-pack.d.ts']).toContain('{ memos: never }');
    expect(files['src/__generated__/events.ts']).toContain("Qualified<'base-pack', __dep_base_pack_PackPluginEvents>");
  });

  it("takes every dependency's plugins, with the inbox that dependency declares", () => {
    const deps = { 'base-pack': dependency({ features: [{ id: 'memos', plugin: { entry: 'y' } }] }, facade({ PackPluginEvents: "{ memos: { type: 'MEMO_ADDED' } }" })) };
    const files = generate({ dependencies: { 'base-pack': '1.0.0' }, features: [withPlugin(system('actions'))] }, deps);
    const events = files['src/__generated__/events.ts'];
    expect(events).toContain("import type { PackPluginEvents as __dep_base_pack_PackPluginEvents } from './deps/base-pack.ts';");
    expect(events).toContain("Qualified<'base-pack', __dep_base_pack_PackPluginEvents>");
  });
});

// `_mergeProvenance`, which names a plugin's owning pack, is covered on its own in provenance.spec.ts.

describe('generated system sends', () => {
  const baseTypes = facade();

  it("names the pack's own systems by feature id and its dependencies' as <dependency>/<feature>", () => {
    const files = generate({ features: [system('memos')] }, {
      'base-pack': dependency({ features: [system('calendar')] }, baseTypes),
      'default-setup': dependency({ id: 'default-setup', builtIn: true, features: [system('memos')] }),
    });
    const events = files['src/__generated__/events.ts'];
    expect(events).toContain("export type PackSystemEvents = {\n  'memos': IncomingEventsOf<__SystemContracts['memos']>;\n};");
    expect(events).toContain("export type QualifiedSystemEvents = Qualified<'demo-pack', PackSystemEvents> & Qualified<'base-pack', __dep_base_pack_PackSystemEvents> & ");
    expect(events).toContain("export type SendableSystemEvents = WithOwnNames<'demo-pack', QualifiedSystemEvents>;");
    // No table of names: the sends derive every address from the pack id (@apack/sdk/ids)
    expect(events).toContain("defineEvents<SendablePluginEvents, SendableSystemEvents>('demo-pack');");
    expect(events).not.toContain('systemIds');
    // Type-only, and over the contracts: it imports no system module, because those import the generated events
    // module this one feeds — reading them here would put the machine in front of the file that describes it
    expect(files['src/__generated__/system-specs.ts']).toContain("export type SystemContracts = {\n  'memos': __system_contract_memos;\n};");
    expect(files['src/__generated__/system-specs.ts']).not.toContain('be/system');
    // Pack code names systems; it gets no module of addresses
    expect(files['src/__generated__/system-ids.ts']).toBeUndefined();
    expect(files['src/__generated__/pack-types.ts']).toContain("export type { PackPluginEvents, PackSystemEvents } from './events.ts';");
  });

  // Pack code resolves a name with `ref`, which is bound to its pack as the sends are. `packId` is the same id as a
  // value, for the one thing a name can't express: pack code that has to say which pack it is — the sandbox that
  // runs an action stamps it on what the action sends. Writing the literal would be wrong on the copy.
  it('binds ref to the pack, so pack code never passes its own pack id', () => {
    const files = generate({ features: [{ id: 'sidebar', plugin: { entry: writePluginEntry('src/features/sidebar/fe/plugin.ts') } }] });
    expect(files['src/__generated__/ref.ts']).toContain("export const packId = 'demo-pack';");
    expect(files['src/__generated__/ref.ts']).toContain('export const ref = (name: FeatureName): FeatureRef => resolveName(name, packId);');
    expect(files['src/__generated__/bus-ids.ts']).toBeUndefined();
  });

  it("gives a pack without systems a sendToSystem for its dependencies' systems", () => {
    const files = generate({ features: [{ id: 'sidebar', plugin: { entry: writePluginEntry('src/features/sidebar/fe/plugin.ts') } }] }, { 'base-pack': dependency({ features: [system('calendar')] }, baseTypes) });
    const events = files['src/__generated__/events.ts'];
    expect(events).not.toContain('system-specs');
    expect(events).toContain("defineEvents<SendablePluginEvents, SendableSystemEvents>('demo-pack');");
    expect(files['src/__generated__/system-specs.ts']).toBeUndefined();
  });
});

/**
 * `pack-types.ts` re-exports `PackPluginState` only for a pack that has plugins, so a dependency without any
 * publishes no such type. `fe.ts` imported it from every dependency regardless, which left the dependent's own
 * typecheck unable to resolve the import.
 */
describe("a dependency that registers no plugin", () => {
  it("is left out of fe.ts's state imports, and kept in everything else", () => {
    const deps = {
      'headless-pack': dependency({ id: 'headless-pack', features: [{ id: 'jobs', system: { entry: 'x' } }] }, facade()),
    };
    const files = generate({ dependencies: { 'headless-pack': '1.0.0' }, features: [withPlugin(system('actions'))] }, deps);

    expect(files['src/__generated__/fe.ts']).not.toContain("from './deps/headless-pack.ts'");
    // its systems are still sendable, so the other facades keep naming it
    expect(files['src/__generated__/events.ts']).toContain("from './deps/headless-pack.ts'");
  });

  it("keeps a dependency that does register one", () => {
    const deps = {
      // A pack with plugins publishes PackPluginState; `facade()`'s defaults can't, since pack-types.ts
      // re-exports it only for such a pack
      'base-pack': dependency({ features: [{ id: 'memos', system: { entry: 'x' }, plugin: { entry: 'y' } }] }, withPluginState(facade())),
    };
    const files = generate({ dependencies: { 'base-pack': '1.0.0' }, features: [withPlugin(system('actions'))] }, deps);

    expect(files['src/__generated__/fe.ts']).toContain("import type { PackPluginState as");
    expect(files['src/__generated__/fe.ts']).toContain("from './deps/base-pack.ts'");
  });
});
