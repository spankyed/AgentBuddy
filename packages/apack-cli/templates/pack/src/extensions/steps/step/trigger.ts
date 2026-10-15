// Compiler callbacks for the __TYPE__ trigger. Static track metadata lives in apack.json.
import type { TriggerFacet } from '@apackdev/sdk/steps';
import { EARS } from '@apackdev/sdk';

export const compile: TriggerFacet['compile'] = (track, trackId, ts, trackKey) => {
  return {
    id: trackId,
    entityType: EARS.Entity.Node,
    createdAt: ts,
    nodeType: '__TYPE__',
    label: typeof track.label === 'string' ? track.label : '__LABEL__',
    trackKey,
    // What the track said, kept on the node so `decompile` can hand it back unchanged
    source: track['__CAMEL__'],
  };
};

export const decompile: TriggerFacet['decompile'] = (node) => {
  return { '__CAMEL__': node.source };
};

export const validate: NonNullable<TriggerFacet['validate']> = (node) => {
  const source = node.source;
  if (typeof source !== 'string' || source.trim().length === 0) {
    return { valid: false, errors: ['Missing required field: source'] };
  }
  return { valid: true, errors: [] };
};
