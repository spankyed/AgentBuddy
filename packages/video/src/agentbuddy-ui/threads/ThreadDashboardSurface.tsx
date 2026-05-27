import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import {PlanArtifactCard} from './PlanArtifactCard';
import {ThreadsHeader} from './ThreadsHeader';
import type {PlanArtifactState, ThreadsHeaderState} from './threadTypes';
import './ThreadDashboardSurface.module.css';

const styles = makeStyles('ThreadDashboardSurface');

export type ThreadDashboardSurfaceState = {
  activeTabId: string;
  artifactSidebar?: Array<{
    id: string;
    meta?: string;
    title: string;
  }>;
  artifact: PlanArtifactState;
  header?: ThreadsHeaderState;
  pinPressed?: boolean;
  pinned?: boolean;
  tabs: Array<{
    id: string;
    label: string;
    pinned?: boolean;
  }>;
};

// Mirrors the threads dashboard tab surface: tab row first, selected thread body below.
export function ThreadDashboardSurface({state}: {state: ThreadDashboardSurfaceState}) {
  const pinnedTabs = state.tabs.filter(tab => tab.pinned || (tab.id === state.activeTabId && state.pinned));
  const regularTabs = state.tabs.filter(tab => !pinnedTabs.some(pinned => pinned.id === tab.id));

  return (
    <div className={styles.root}>
      {state.header ? <ThreadsHeader state={state.header} /> : null}
      {pinnedTabs.length > 0 ? (
        <div className={styles.pinnedRow}>
          {pinnedTabs.map(tab => <ThreadTab active={tab.id === state.activeTabId} key={tab.id} pinned tab={tab} />)}
        </div>
      ) : null}
      <div className={styles.tabRow}>
        {regularTabs.map(tab => <ThreadTab active={tab.id === state.activeTabId} key={tab.id} tab={tab} />)}
      </div>
      <div className={styles.body} data-sidebar={state.artifactSidebar?.length ? 'true' : 'false'}>
        {state.artifactSidebar?.length ? (
          <aside className={styles.artifactSidebar}>
            <h3>Artifacts</h3>
            {state.artifactSidebar.map(item => (
              <div className={item.id === state.artifact.id ? styles.artifactItemActive : styles.artifactItem} key={item.id}>
                <Icons.FileText size={14} />
                <div>
                  <strong>{item.title}</strong>
                  {item.meta ? <small>{item.meta}</small> : null}
                </div>
              </div>
            ))}
          </aside>
        ) : null}
        <section className={styles.content}>
          <div className={styles.threadHeader}>
            <div className={styles.threadTitle}>
              <span className={styles.dot} />
              <h2>{state.tabs.find(tab => tab.id === state.activeTabId)?.label}</h2>
            </div>
            <button className={state.pinned ? styles.pinButtonActive : styles.pinButton} data-pressed={state.pinPressed || undefined} type="button">
              <Icons.Pin size={14} />
            </button>
          </div>
          <div className={styles.artifactWrap}>
            <PlanArtifactCard artifact={state.artifact} />
          </div>
        </section>
      </div>
    </div>
  );
}

function ThreadTab({active, pinned, tab}: {active?: boolean; pinned?: boolean; tab: {id: string; label: string}}) {
  return (
    <div className={active ? styles.tabActive : styles.tab}>
      <span className={styles.tabDot} />
      <span className={styles.tabLabel}>{tab.label}</span>
      <Icons.Pin className={pinned ? styles.tabPinPinned : styles.tabPin} size={12} />
    </div>
  );
}
