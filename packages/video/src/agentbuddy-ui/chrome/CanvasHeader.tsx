import {Icons} from '../primitives/Icon';
import styles from './CanvasHeader.module.css';

type CanvasHeaderProps = {
  breadcrumbs: string[];
  title?: string;
};

// Mirrors packages/renderer/src/core/components/layout/canvas-area.vue.
export function CanvasHeader({breadcrumbs, title}: CanvasHeaderProps) {
  return (
    <header className={styles.root}>
      <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
        <button className={styles.menuButton} title="Plugin menu">
          <Icons.EllipsisVertical size={14} />
        </button>
        {breadcrumbs.map((crumb, index) => (
          <span key={`${crumb}-${index}`} className={styles.crumbWrap}>
            <span className={styles.crumb}>{crumb}</span>
            {index < breadcrumbs.length - 1 ? <Icons.ChevronRight className={styles.chevron} size={12} /> : null}
          </span>
        ))}
      </nav>
      {title ? <div className={styles.title}>{title}</div> : null}
    </header>
  );
}

