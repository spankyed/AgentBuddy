import {Icons} from '../primitives/Icon';
import './CommitMessageBox.module.css';
import {makeStyles} from '../primitives/makeStyles';

const styles = makeStyles('CommitMessageBox');

export function CommitMessageBox({message, generating}: {generating?: boolean; message: string}) {
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.labelWrap}>
          <button className={styles.moreButton} title="More actions" type="button"><Icons.EllipsisVertical size={14} /></button>
          <span className={styles.label}>{generating ? 'Generating...' : 'Commit Message'}</span>
        </div>
        <button className={styles.generate} disabled={generating} title="Generate commit message">
          {generating ? <Icons.Loader2 className={styles.spinner} size={14} /> : <Icons.Sparkle size={14} />}
        </button>
      </div>
      <textarea className={styles.textarea} data-generating={generating ? 'true' : undefined} placeholder="Message (currently on as/react-launch-film)" rows={4} value={message} readOnly />
      <button className={styles.button}>Commit</button>
    </div>
  );
}
