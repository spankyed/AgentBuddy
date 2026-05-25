import type {CSSProperties} from 'react';
import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {ActionRow, ActionsSurfaceState} from './actionTypes';
import './ActionsSurface.module.css';

const styles = makeStyles('ActionsSurface');

export function ActionsSurface({state}: {state: ActionsSurfaceState}) {
  const hasActions = state.actions.length > 0;
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Icons.Play size={16} color="rgb(115 115 115)" />
          <p className={styles.headerText}>Manage action templates</p>
        </div>
        <div className={styles.button}>New Action</div>
      </header>
      <main className={styles.body}>
        {hasActions ? <ActionsTable state={state} /> : <EmptyState />}
      </main>
    </div>
  );
}

function ActionsTable({state}: {state: ActionsSurfaceState}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead className={styles.thead}>
          <tr className={styles.headRow}>
            <th className={styles.th}>Label</th>
            <th className={styles.th}>Description</th>
            <th className={styles.th}>Category</th>
            <th className={styles.th}>Inputs</th>
            <th className={styles.thRight}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {state.actions.map(action => <ActionTableRow key={action.id} action={action} state={state} />)}
        </tbody>
      </table>
    </div>
  );
}

function ActionTableRow({action, state}: {action: ActionRow; state: ActionsSurfaceState}) {
  const category = state.categories.find(item => item.name === action.category);
  return (
    <tr className={styles.row}>
      <td className={styles.td}><span className={styles.label}>{action.label}</span></td>
      <td className={styles.td}><span className={styles.description}>{action.description || 'No description'}</span></td>
      <td className={styles.td}>
        <span className={styles.category} style={categoryStyle(category)}>
          {category?.name ?? 'none'}
        </span>
      </td>
      <td className={styles.td}>
        <div className={styles.inputPills}>
          {action.inputs.length === 0 ? <span className={styles.none}>none</span> : action.inputs.slice(0, 2).map(input => <span key={input} className={styles.input}>{input}</span>)}
          {action.inputs.length > 2 ? <span className={styles.input}>+{action.inputs.length - 2} more</span> : null}
        </div>
      </td>
      <td className={`${styles.td} ${styles.actions}`}>
        <span className={styles.delete}><Icons.Trash2 size={16} /></span>
      </td>
    </tr>
  );
}

function EmptyState() {
  return (
    <div className={styles.empty}>
      <div>
        <Icons.Play className={styles.emptyIcon} size={48} />
        <div className={styles.emptyTitle}>No actions yet</div>
        <div className={styles.emptyCopy}>Create your first action function to get started</div>
        <div className={styles.button} style={{display: 'inline-flex', alignItems: 'center', gap: 8}}><Icons.Plus size={16} /> New Action</div>
      </div>
    </div>
  );
}

function categoryStyle(category: {color: string} | undefined): CSSProperties {
  if (!category) return {'--category-bg': 'rgb(38 38 38)', '--category-color': 'rgb(163 163 163)', '--category-border': 'rgb(64 64 64)'} as CSSProperties;
  return {
    '--category-bg': `${category.color}1A`,
    '--category-color': category.color,
    '--category-border': `${category.color}33`,
  } as CSSProperties;
}
