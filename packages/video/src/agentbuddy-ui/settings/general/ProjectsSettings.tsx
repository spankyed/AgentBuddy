import {Icons} from '../../primitives/Icon';
import type {SettingsProject} from '../settingsTypes';
import './SettingsCommon.module.css';
import './ProjectsSettings.module.css';
import {makeStyles} from '../../primitives/makeStyles';
const common = makeStyles('SettingsCommon');
const styles = makeStyles('ProjectsSettings');

export function ProjectsSettings({projects}: {projects: SettingsProject[]}) {
  return (
    <div className={common.panel}>
      <p className={common.description} style={{marginBottom: 24}}>Manage your projects. Each project can contain multiple directories.</p>
      <div className={styles.list}>
        {projects.map(project => (
          <article className={styles.project} key={project.name}>
            <header className={styles.projectHeader}>
              <span className={styles.swatch} style={{background: project.color}} />
              <input className={`${common.input} ${styles.name}`} readOnly value={project.name} />
              <button className={styles.dirButton} type="button"><Icons.Plus size={12} />Add Directory</button>
              <Icons.X size={14} />
            </header>
            <div className={styles.dirs}>
              {project.directories.map((dir, index) => <span className={styles.dir} key={dir} style={index === 0 ? {borderLeft: `2px solid ${project.color}`} : undefined}>{dir.split('/').slice(-2).join('/')}</span>)}
            </div>
          </article>
        ))}
      </div>
      <button className={styles.dirButton} style={{border: '2px dashed rgb(64 64 64)', marginTop: 12, padding: '8px 16px'}} type="button"><Icons.Plus size={14} />Add Project</button>
    </div>
  );
}
