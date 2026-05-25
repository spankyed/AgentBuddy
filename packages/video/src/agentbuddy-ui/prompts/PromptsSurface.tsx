import {makeStyles} from '../primitives/makeStyles';
import {PromptEditor} from './PromptEditor';
import {PromptList} from './PromptList';
import {PromptTestPanel} from './PromptTestPanel';
import type {PromptSurfaceState} from './promptTypes';
import './PromptsSurface.module.css';

const styles = makeStyles('PromptsSurface');

export function PromptsSurface({state}: {state: PromptSurfaceState}) {
  return (
    <div className={styles.root}>
      <PromptList state={state} />
      <PromptEditor state={state} />
      <PromptTestPanel state={state} />
    </div>
  );
}
