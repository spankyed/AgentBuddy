import {Icons} from '../primitives/Icon';
import './ModePhaseSelector.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('ModePhaseSelector');

type ModePhaseSelectorProps = {
  mode: string;
  phase?: string;
};

// Mirrors packages/renderer/src/plugins/threads/chat/ModePhaseSelector.vue.
export function ModePhaseSelector({mode, phase}: ModePhaseSelectorProps) {
  return (
    <div className={styles.root}>
      <button className={styles.mode} type="button">
        <span>{mode}</span>
        <Icons.ChevronRight className={styles.chevronDown} size={13} />
      </button>
      {phase ? (
        <button className={styles.phase} type="button">
          <span>{phase}</span>
          <Icons.ChevronRight className={styles.chevronDown} size={13} />
        </button>
      ) : null}
    </div>
  );
}

