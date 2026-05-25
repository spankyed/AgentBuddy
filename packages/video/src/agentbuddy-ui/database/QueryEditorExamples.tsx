import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {DatabaseSurfaceState} from './databaseTypes';
import './QueryEditorPanel.module.css';

const styles = makeStyles('QueryEditorPanel');

export function QueryEditorExamples({examples}: {examples: DatabaseSurfaceState['examples']}) {
  return (
    <div className={styles.examples}>
      <div className={styles.examplesScroll}>
        <div className={styles.exampleStack}>
          {examples.map(example => <ExampleCard key={example.title} example={example} />)}
        </div>
      </div>
    </div>
  );
}

function ExampleCard({example}: {example: DatabaseSurfaceState['examples'][number]}) {
  return (
    <div className={styles.exampleCard}>
      <div className={styles.exampleBody}>
        <h4>{example.title}</h4>
        <p>{example.description}</p>
        <pre>{example.query}</pre>
      </div>
      <button title="Use this example"><Icons.ArrowRight size={16} /></button>
    </div>
  );
}
