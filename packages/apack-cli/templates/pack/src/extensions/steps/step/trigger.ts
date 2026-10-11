// A trigger's build-time facet. A trigger is not a step with a flag: it owns a DSL *track* rather than a
// node in one, so it compiles from a track and decompiles back to the track's fields, and its facet is a
// `TriggerFacet` rather than a `StepBuildFacet`. `apack.json` names it at `extensions.steps.__TYPE__.trigger.facet`.
import type { TriggerFacet, StepNodeFacet } from '@apack/sdk/steps';
import { EARS } from '@apack/sdk';

export const __CAMEL__TriggerBuild: TriggerFacet = {
  // The track field this trigger owns. `entry({ __TYPE__: '...' }, [ ... ])` in a flow reaches this facet
  // because the field is here, and the generated flow helper is named after it
  trackField: '__TYPE__',

  compile(track, trackId, ts, trackKey) {
    return {
      id: trackId,
      entityType: EARS.Entity.Node,
      createdAt: ts,
      nodeType: '__TYPE__',
      label: typeof track.label === 'string' ? track.label : '__LABEL__',
      trackKey,
      // What the track said, kept on the node so `decompile` can hand it back unchanged
      source: track['__TYPE__'],
    };
  },

  decompile(node) {
    return { '__TYPE__': node.source };
  },

  // Whether the flow stays alive once every track has drained. A trigger that fires again later says true
  persistent: false,

  // Checked when a node of this type is persisted, so the app refuses a half-configured trigger rather
  // than storing one
  validate(node) {
    const source = node.source;
    if (typeof source !== 'string' || source.trim().length === 0) {
      return { valid: false, errors: ['Missing required field: source'] };
    }
    return { valid: true, errors: [] };
  },
};

/**
 * What a node of this type starts with. Both processes read it — the backend writes it onto a new node and
 * the canvas draws it — so it lives here, where no Vue or icon import reaches, rather than in `fe.ts`.
 *
 * **These defaults have to satisfy `validate` above.** Adding a trigger to a flow creates a node from them
 * and nothing else, so a required field left empty here is a trigger nobody can add: the node is refused
 * the moment it is written, before the user has a form to fill in.
 */
export const __CAMEL__TriggerNode: StepNodeFacet = {
  label: '__LABEL__',
  defaultLabel: 'On __TYPE__',
  defaults: { source: 'change me' },
};
