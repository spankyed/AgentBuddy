import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import './QuickPromptsPopup.module.css';

const styles = makeStyles('QuickPromptsPopup');

type QuickPromptsPopupProps = {
  prompts: Array<{
    id: string;
    text: string;
  }>;
};

// Mirrors packages/renderer/src/plugins/threads/chat/QuickPromptsPopup.vue.
export function QuickPromptsPopup({prompts}: QuickPromptsPopupProps) {
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span>Quick Prompts</span>
        <button type="button"><Icons.Pencil size={14} /></button>
      </div>
      <div className={styles.list}>
        {prompts.length ? prompts.map((prompt, index) => (
          <div className={styles.item} key={prompt.id}>
            <button type="button">
              <span className={styles.index}>{index + 1}</span>
              <span className={styles.text}>
                {prompt.text.split('\n')[0]}
                {prompt.text.includes('\n') ? <span className={styles.ellipsis}>...</span> : null}
              </span>
            </button>
            <button className={styles.copy} title="Copy prompt" type="button"><Icons.Copy size={14} /></button>
          </div>
        )) : (
          <div className={styles.empty}>No quick prompts</div>
        )}
      </div>
    </div>
  );
}
