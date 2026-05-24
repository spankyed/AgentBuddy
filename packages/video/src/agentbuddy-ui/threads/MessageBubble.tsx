import type {ReactNode} from 'react';
import {cx} from '../primitives/classNames';
import {makeStyles} from '../primitives/makeStyles';
import {MessageActions} from './MessageActions';
import {MessageStatusIndicator} from './MessageStatusIndicator';
import './MessageBubble.module.css';

const styles = makeStyles('MessageBubble');

type MessageBubbleProps = {
  children: ReactNode;
  createdAt?: string;
  sender: 'assistant' | 'system' | 'user';
  status?: 'queued' | 'cancelled';
};

// Mirrors packages/renderer/src/plugins/threads/chat/message.vue bubble structure.
export function MessageBubble({children, createdAt, sender, status}: MessageBubbleProps) {
  if (sender === 'system') return <div className={styles.system}>{children}</div>;
  return (
    <div className={cx(styles.row, sender === 'user' ? styles.userRow : styles.assistantRow)}>
      <div className={styles.group}>
        <div className={styles.actions}>
          <MessageActions createdAt={createdAt} isUser={sender === 'user'} status={status} />
        </div>
        <div className={cx(styles.bubble, sender === 'user' ? styles.userBubble : styles.assistantBubble, status === 'cancelled' && styles.cancelled)}>
          {children}
        </div>
        {sender === 'user' ? <MessageStatusIndicator status={status} /> : null}
      </div>
    </div>
  );
}
