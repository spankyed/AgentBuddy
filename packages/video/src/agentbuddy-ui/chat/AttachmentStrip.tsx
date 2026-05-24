import type {ChatAttachment} from './chatTypes';
import styles from './ChatComposer.module.css';

// Mirrors attachment strip behavior from packages/renderer/src/plugins/threads/chat/input.vue.
export function AttachmentStrip({attachments = []}: {attachments?: ChatAttachment[]}) {
  if (attachments.length === 0) return null;
  return (
    <div className={styles.attachmentStrip}>
      {attachments.map((attachment, index) => (
        <div key={`${attachment.label}-${index}`} className={attachment.type === 'image' ? styles.imageAttachment : styles.fileAttachment}>
          <span className={styles.attachmentIcon}>{attachment.type === 'image' ? '⌘' : '#'}</span>
          <span>{attachment.label}</span>
        </div>
      ))}
    </div>
  );
}

