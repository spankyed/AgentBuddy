// A trigger's build-time facet. A trigger is not a step with a flag: it owns a DSL *track* rather than a
// node in one, so it compiles from a track and decompiles back to the track's fields, and its facet is a
// `TriggerFacet` rather than a `StepBuildFacet`. `apack.json` names it at `extensions.steps.__TYPE__.trigger.facet`.
import type { TriggerFacet } from '@apackdev/sdk/steps';
import { EARS } from '@apackdev/sdk';

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
