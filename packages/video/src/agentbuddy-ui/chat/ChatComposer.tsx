import {AttachmentStrip} from './AttachmentStrip';
import {BottomThreadTabs} from './BottomThreadTabs';
import {ComposerActionBar} from './ComposerActionBar';
import type {ChatComposerState} from './chatTypes';
import './ChatComposer.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('ChatComposer');

// Mirrors packages/renderer/src/plugins/threads/chat/input.vue.
export function ChatComposer({state}: {state: ChatComposerState}) {
  return (
    <footer className={styles.outer}>
      <form className={styles.form}>
        <div className={styles.inputCard} data-onboarding-id="agent-chat-input">
          <AttachmentStrip attachments={state.attachments} />
          <div className={styles.editor}>
            <span className={state.text ? styles.text : styles.placeholder}>{state.text || state.placeholder}</span>
          </div>
          <ComposerActionBar disabled={state.disabled} mode={state.mode} phase={state.phase} />
          {state.statusLine ? <div className={styles.statusLine}>{state.statusLine}</div> : null}
        </div>
      </form>
      <BottomThreadTabs />
    </footer>
  );
}
