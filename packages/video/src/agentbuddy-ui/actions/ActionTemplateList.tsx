import {cx} from '../primitives/classNames';
import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {ActionsSurfaceState} from './actionTypes';
import './ActionTemplateList.module.css';

const styles = makeStyles('ActionTemplateList');

export function ActionTemplateList({state}: {state: ActionsSurfaceState}) {
  return (
    <aside className={styles.root}>
      <header className={styles.header}>
        <span>Action Templates</span>
        <Icons.Plus size={15} />
      </header>
      <div className={styles.list}>
        {state.actions.map(action => (
          <div key={action.id} className={cx(styles.item, action.id === state.activeActionId && styles.active)}>
            <div className={styles.name}>{action.name}</div>
            <div className={styles.meta}>{action.trigger} · {action.updatedAt}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}
