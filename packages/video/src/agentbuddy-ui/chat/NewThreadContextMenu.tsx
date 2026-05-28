import type {ChatComposerState} from './chatTypes';
import {Icons} from '../primitives/Icon';
import './ChatComposer.module.css';
import {makeStyles} from '../primitives/makeStyles';

const styles = makeStyles('ChatComposer');

type NewThreadMenuState = NonNullable<NonNullable<ChatComposerState['bottomTabs']>['newThreadMenu']>;

// Mirrors the New thread context menu in packages/renderer/src/plugins/threads/chat/recent-threads.vue.
export function NewThreadContextMenu({menu}: {menu: NewThreadMenuState}) {
  return (
    <div className={styles.newThreadContextMenu}>
      <div className={styles.newThreadContextMenuSub} data-open={menu.openSubmenu === 'project' ? 'true' : undefined}>
        <Icons.FolderOpen size={16} />
        <span>In Project</span>
        <Icons.ChevronRight className={styles.newThreadContextChevron} size={12} />
        {menu.openSubmenu === 'project' ? <ProjectSubmenu projects={menu.projects} /> : null}
      </div>
      <div className={styles.newThreadContextSeparator} />
      <div className={styles.newThreadContextMenuSub} data-open={menu.openSubmenu === 'child' ? 'true' : undefined}>
        <Icons.GitBranchPlus size={16} />
        <span>As Child of</span>
        <Icons.ChevronRight className={styles.newThreadContextChevron} size={12} />
        {menu.openSubmenu === 'child' ? <ChildThreadSubmenu threads={menu.threads} /> : null}
      </div>
    </div>
  );
}

function ProjectSubmenu({projects}: {projects: NewThreadMenuState['projects']}) {
  return (
    <div className={styles.newThreadContextSubmenu}>
      <div className={styles.newThreadContextMutedItem}>No project (ask me)</div>
      {projects.map(project => (
        <div key={project.name}>
          <div className={styles.newThreadContextSeparator} />
          <div className={styles.newThreadContextProjectHeader}>
            <span className={styles.newThreadContextProjectDot} style={{backgroundColor: project.color}} />
            <span className={styles.newThreadContextProjectName}>{project.name}</span>
          </div>
          {project.directories.map(directory => (
            <div className={styles.newThreadContextSubItem} key={directory}>
              <span>{directoryName(directory)}</span>
            </div>
          ))}
        </div>
      ))}
      {projects.length === 0 ? <div className={styles.newThreadContextEmpty}>No projects configured</div> : null}
    </div>
  );
}

function ChildThreadSubmenu({threads}: {threads: NewThreadMenuState['threads']}) {
  return (
    <div className={styles.newThreadContextSubmenu}>
      {threads.map(thread => (
        <div className={styles.newThreadContextChildItem} key={thread.id}>
          <div className={styles.newThreadContextChildBody}>
            <small>{thread.shortCode}</small>
            <span>{thread.title || 'Untitled'}</span>
          </div>
        </div>
      ))}
      {threads.length === 0 ? <div className={styles.newThreadContextChildEmpty}>No threads available</div> : null}
    </div>
  );
}

function directoryName(directory: string) {
  return directory.split('/').filter(Boolean).pop() || directory;
}
