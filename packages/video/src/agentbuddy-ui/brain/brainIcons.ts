import {Icons} from '../primitives/Icon';
import type {BrainNode} from './brainTypes';

export function iconForBrainNode(node: BrainNode) {
  if (node.tNodeType === 'event') return Icons.Radio;
  switch (node.stepNodeType) {
    case 'listener': return Icons.Radio;
    case 'schedule': return Icons.Clock;
    case 'flow': return Icons.Network;
    case 'llm': return Icons.Sparkle;
    case 'switch': return Icons.Split;
    case 'fire': return Icons.Zap;
    case 'kill': return Icons.Plug;
    default: return Icons.Play;
  }
}
