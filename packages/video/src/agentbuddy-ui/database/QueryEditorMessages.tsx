import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import './QueryEditorPanel.module.css';

const styles = makeStyles('QueryEditorPanel');

export function QueryEditorMessages({error, successMessage}: {error?: string | null; successMessage?: string}) {
  if (error) return <div className={styles.error}><Icons.AlertCircle size={14} /> {error}</div>;
  if (successMessage) return <div className={styles.success}><Icons.CircleCheck size={14} /> {successMessage}</div>;
  return null;
}
