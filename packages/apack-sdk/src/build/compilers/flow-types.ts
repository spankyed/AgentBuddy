export interface DSLNodeBase {
  label?: string;
  description?: string;
  final?: boolean;
  next?: string;
  [key: string]: unknown;
}

export interface DSLStepNode extends DSLNodeBase {
  type: string;
  [key: string]: unknown;
}

export type FlowDSL = Record<string, Track[] | FlowConfig>;

export interface FlowConfig {
  tracks: Track[];
  root?: boolean;
  contentHash?: string;
}

export interface Track {
  event?: string;
  schedule?: string;
  label?: string;
  description?: string;
  exits: DSLStepNode[][];
  /**
   * The field a trigger owns, which the SDK cannot know: a trigger declares it as `TriggerFacet.trackField`
   * and the generated flow helper is named after it, so a pack's own trigger names a field that is not
   * `event` or `schedule`. Those two are kept above for completion, being the ones the shipped pack declares.
   *
   * Typing it away is not what catches a typo — `validateFlowDSL` is, and it has the better answer because
   * it derives the fields it accepts from the triggers actually registered (`knownTrackFields`) and refuses
   * a track holding none of them. While this was the two literals alone, the generated track builder for
   * any other pack's trigger did not compile, and no fixture pack declared one to find out.
   */
  [trackField: string]: string | DSLStepNode[][] | undefined;
}

export function isFlowConfig(value: Track[] | FlowConfig): value is FlowConfig {
  return !Array.isArray(value);
}

export function resolveTracks(entry: Track[] | FlowConfig): Track[] {
  return isFlowConfig(entry) ? entry.tracks : entry;
}
