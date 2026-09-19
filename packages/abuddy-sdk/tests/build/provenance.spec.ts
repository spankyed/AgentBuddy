// What a dependency tree declares, and which pack declares it. A dependent sees only its direct
// dependencies' snapshots, so each snapshot carries the whole tree's names — otherwise a dependent of
// two packs sharing an ancestor reads the ancestor's names arriving from both as a collision.
//
// Entities, relation kinds, commands and plugins used to travel as three differently-shaped fields with
// three readers running this same algorithm. These tests are on the one that replaced them.
import { describe, expect, it } from 'vitest';
import { PROVENANCE_KINDS, _buildProvenance, _mergeProvenance, type ProvenanceSource } from '../../src/build/manifest.ts';

const dep = (id: string, source: ProvenanceSource) => [id, source] as const;

describe('_mergeProvenance', () => {
  it('attributes a dependency\'s own names to that dependency', () => {
    expect(_mergeProvenance('commands', [dep('base-pack', { manifest: { commands: [{ name: 'note' }] } })]))
      .toEqual({ note: 'base-pack' });
  });

  // The whole reason a snapshot carries more than its own pack's names
  it("carries a dependency's inherited names through, attributed to whoever declared them", () => {
    const merged = _mergeProvenance('entities', [
      dep('mid-pack', { manifest: { entities: { Note: 'Note' } }, provenance: { entities: { Memo: 'deep-pack' } } }),
    ]);
    expect(merged).toEqual({ Memo: 'deep-pack', Note: 'mid-pack' });
  });

  /**
   * The nearer pack wins, which is why each dependency's inherited record goes in before its own
   * manifest: that is the pack a dependent could add to its own dependencies to reach the name.
   */
  it('lets a dependency that declares a name itself win over one that only inherited it', () => {
    const inheritedOnly = dep('left-pack', { manifest: {}, provenance: { commands: { note: 'deep-pack' } } });
    const declaresIt = dep('right-pack', { manifest: { commands: [{ name: 'note' }] } });

    expect(_mergeProvenance('commands', [inheritedOnly, declaresIt])).toEqual({ note: 'right-pack' });
    // …and the reverse order still prefers the one that declares it, because its manifest pass is last
    expect(_mergeProvenance('commands', [declaresIt, inheritedOnly])).toEqual({ note: 'deep-pack' });
  });

  /**
   * Within one dependency the order is inherited first, then its own manifest — so a pack that
   * redeclares a name it also inherited is credited with it. Nothing else in these fixtures can tell
   * the two passes apart: a dependency that only inherits, or only declares, reads the same either way.
   */
  it("credits a dependency for a name it redeclares over the one it inherited it from", () => {
    const merged = _mergeProvenance('commands', [
      dep('mid-pack', { manifest: { commands: [{ name: 'note' }] }, provenance: { commands: { note: 'deep-pack' } } }),
    ]);
    expect(merged).toEqual({ note: 'mid-pack' });
  });

  it('lets the pack being built win over everything it depends on', () => {
    const merged = _mergeProvenance(
      'entities',
      [dep('base-pack', { manifest: { entities: { Note: 'Note' } } })],
      { id: 'app-pack', manifest: { entities: { Note: 'Note' } } },
    );
    expect(merged).toEqual({ Note: 'app-pack' });
  });

  it('reads a snapshot that declares nothing and inherited nothing', () => {
    expect(_mergeProvenance('plugins', [dep('bare-pack', { manifest: {} })])).toEqual({});
    expect(_mergeProvenance('plugins', [])).toEqual({});
  });

  // One table entry per kind, so a new kind is a line rather than a type pair and a reader
  describe('reads every kind off a manifest', () => {
    const manifest = {
      entities: { Note: 'Note' },
      relKinds: { tagged: 'tagged' },
      commands: [{ name: 'note' }],
      features: [{ id: 'notes', plugin: {} }, { id: 'headless' }],
    };
    const cases: Array<[keyof typeof PROVENANCE_KINDS, Record<string, string>]> = [
      ['entities', { Note: 'base-pack' }],
      ['relKinds', { tagged: 'base-pack' }],
      ['commands', { note: 'base-pack' }],
      // A feature without a plugin owns no plugin id: nothing could be sent there
      ['plugins', { notes: 'base-pack' }],
    ];
    it.each(cases)('%s', (kind, expected) => {
      expect(_mergeProvenance(kind, [dep('base-pack', { manifest })])).toEqual(expected);
    });

    it('covers every kind in the table, so a new one cannot be added untested', () => {
      expect(cases.map(([kind]) => kind).sort()).toEqual(Object.keys(PROVENANCE_KINDS).sort());
    });
  });
});

describe('_buildProvenance', () => {
  it('records every kind that declared something', () => {
    const provenance = _buildProvenance(
      [dep('base-pack', { manifest: { entities: { Note: 'Note' }, commands: [{ name: 'note' }] } })],
      { id: 'app-pack', manifest: { features: [{ id: 'app', plugin: {} }] } },
    );
    expect(provenance).toEqual({ entities: { Note: 'base-pack' }, commands: { note: 'base-pack' }, plugins: { app: 'app-pack' } });
  });

  // An empty record and an absent kind would read the same; the absent one says what it means
  it('leaves out a kind nothing declared, rather than writing it empty', () => {
    expect(_buildProvenance([dep('bare-pack', { manifest: {} })])).toEqual({});
  });
});
