import './NotesRightRail.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('NotesRightRail');

export function NotesRightRail() {
  const groups = ['☆ FAVORITES', '🔥 current', '💻 cli', '🎬 Videos', '🌐 Clientlabs', '🚀 Agentbuddy', '📝 Tasklist', '⭐ Brand & Content'];
  return (
    <div>
      <div className={styles.title}>Notes</div>
      {groups.map(item => <div key={item} className={item.includes('Tasklist') ? styles.activeItem : styles.item}>{item}</div>)}
    </div>
  );
}

