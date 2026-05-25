import {cx} from '../primitives/classNames';
import {makeStyles} from '../primitives/makeStyles';
import type {BrainSurfaceState} from './brainTypes';
import './BrainGraph.module.css';

const styles = makeStyles('BrainGraph');

const positions = [
  {x: 150, y: 116},
  {x: 430, y: 96},
  {x: 380, y: 292},
  {x: 690, y: 176},
  {x: 650, y: 360},
];

export function BrainGraph({state}: {state: BrainSurfaceState}) {
  return (
    <section className={styles.root}>
      <Edge from={positions[0]} to={positions[1]} />
      <Edge from={positions[0]} to={positions[2]} />
      <Edge from={positions[1]} to={positions[3]} />
      <Edge from={positions[2]} to={positions[4]} />
      {state.memories.map((memory, index) => {
        const pos = positions[index % positions.length];
        return (
          <div
            key={memory.id}
            className={cx(styles.node, memory.id === state.activeMemoryId && styles.active)}
            style={{left: pos.x, top: pos.y}}
          >
            <div>{memory.label}</div>
            <div className={styles.kind}>{memory.kind} · {memory.strength}%</div>
          </div>
        );
      })}
    </section>
  );
}

function Edge({from, to}: {from: {x: number; y: number}; to: {x: number; y: number}}) {
  const x1 = from.x + 172;
  const y1 = from.y + 30;
  const x2 = to.x;
  const y2 = to.y + 30;
  const width = Math.hypot(x2 - x1, y2 - y1);
  const rotate = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
  return <div className={styles.edge} style={{left: x1, top: y1, width, transform: `rotate(${rotate}deg)`}} />;
}
