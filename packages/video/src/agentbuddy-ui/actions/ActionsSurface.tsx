import {makeStyles} from '../primitives/makeStyles';
import {ActionEditor} from './ActionEditor';
import {ActionRunPanel} from './ActionRunPanel';
import {ActionTemplateList} from './ActionTemplateList';
import type {ActionsSurfaceState} from './actionTypes';
import './ActionsSurface.module.css';

const styles = makeStyles('ActionsSurface');

export function ActionsSurface({state}: {state: ActionsSurfaceState}) {
  return (
    <div className={styles.root}>
      <ActionTemplateList state={state} />
      <ActionEditor state={state} />
      <ActionRunPanel state={state} />
    </div>
  );
}
