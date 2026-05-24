import styles from './NotesPanel.module.css';

export function NotesPanel({activeIndex = 2}: {activeIndex?: number}) {
  const rows = ['📝 Tasklist', '🚧 default setup', '🔥 current', '✓ remotion', '✓ phone app', '🪲 bugs', '🗺️ V1 Roadmap'];
  return (
    <aside className={styles.root}>
      {rows.map((row, index) => (
        <div key={row} className={index === activeIndex ? styles.activeRow : styles.row} style={{opacity: index > 4 ? 0.72 : 1}}>
          {row}
        </div>
      ))}
    </aside>
  );
}

