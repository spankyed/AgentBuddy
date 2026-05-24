import type {ReactNode} from 'react';
import {cx} from '../primitives/classNames';
import {makeStyles} from '../primitives/makeStyles';
import './MessageBubble.module.css';

const styles = makeStyles('MessageBubble');

type MessageBubbleProps = {
  children: ReactNode;
  sender: 'assistant' | 'system' | 'user';
};

// Mirrors packages/renderer/src/plugins/threads/chat/message.vue bubble structure.
export function MessageBubble({children, sender}: MessageBubbleProps) {
  if (sender === 'system') return <div className={styles.system}>{children}</div>;
  return (
    <div className={cx(styles.row, sender === 'user' ? styles.userRow : styles.assistantRow)}>
      <div className={cx(styles.bubble, sender === 'user' ? styles.userBubble : styles.assistantBubble)}>{children}</div>
    </div>
  );
}

