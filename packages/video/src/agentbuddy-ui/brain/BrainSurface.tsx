import {makeStyles} from '../primitives/makeStyles';
import {BrainGraph} from './BrainGraph';
import {MemoryInspector} from './MemoryInspector';
import type {BrainSurfaceState} from './brainTypes';
import './BrainSurface.module.css';

const styles = makeStyles('BrainSurface');

export function BrainSurface({state}: {state: BrainSurfaceState}) {
  return (
    <div className={styles.root}>
      <BrainGraph state={state} />
      <MemoryInspector state={state} />
    </div>
  );
}
