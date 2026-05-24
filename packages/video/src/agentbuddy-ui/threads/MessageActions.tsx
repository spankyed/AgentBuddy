import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import './MessageActions.module.css';

const styles = makeStyles('MessageActions');

// Mirrors the floating hover action cluster in packages/renderer/src/plugins/threads/chat/message.vue.
export function MessageActions({createdAt, isUser, status}: {createdAt?: string; isUser?: boolean; status?: 'queued' | 'cancelled'}) {
  return (
    <div className={styles.root}>
      {createdAt ? <span className={styles.timestamp}>{createdAt}</span> : null}
      {isUser ? <button type="button" title={status ? 'Revert to input' : 'Revert'}><Icons.Undo2 size={16} /></button> : null}
      {status === 'queued' ? <button type="button" title="Cancel queued message"><Icons.X size={16} /></button> : null}
      {status === 'cancelled' ? <button type="button" title="Resend message"><Icons.RotateCcw size={16} /></button> : null}
      {!status ? <button type="button" title="Fork conversation"><Icons.GitFork size={16} /></button> : null}
      <button type="button" title="Copy message text"><Icons.Copy size={16} /></button>
    </div>
  );
}
