import {Icons} from '../primitives/Icon';
import type {ChatModeOption} from './chatTypes';
import './ModePhaseSelector.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('ModePhaseSelector');

type ModePhaseSelectorProps = {
  disabled?: boolean;
  forcedMode?: string;
  mode: string;
  modeOptions?: ChatModeOption[];
  openSelector?: 'mode' | 'phase';
  phase?: string;
};

// Mirrors packages/renderer/src/plugins/threads/chat/ModePhaseSelector.vue.
export function ModePhaseSelector({disabled, forcedMode, mode, modeOptions = [], openSelector, phase}: ModePhaseSelectorProps) {
  const visibleModes = modeOptions.filter(option => !option.hidden);
  const currentMode = modeOptions.find(option => option.name === mode);
  const phases = currentMode?.phases ?? [];
  const currentPhase = phases.find(option => option.name === phase);
  const forcedModeName = modeOptions.find(option => option.name === forcedMode)?.name ?? 'Birth';
  const hasPhases = phases.length > 0;
  const currentModeName = currentMode?.name ?? 'Select mode';
  const currentPhaseName = currentPhase?.name ?? 'Select phase';
  if (forcedMode) {
    return (
      <div className={styles.rootForced}>
        <span>{forcedModeName}</span>
      </div>
    );
  }
  return (
    <div className={styles.root}>
      <div className={styles.selector}>
        <button className={styles.mode} disabled={disabled} type="button">
          <span className={styles.buttonLabel}>{currentModeName}</span>
          <Icons.ChevronDown className={openSelector === 'mode' ? styles.chevronUp : styles.chevronDown} size={14} />
        </button>
        {hasPhases ? (
          <>
            <span className={styles.divider} />
            <button
              className={styles.phase}
              disabled={disabled}
              style={currentPhase?.color ? {backgroundColor: `${currentPhase.color}33`} : undefined}
              type="button"
            >
              <span className={styles.buttonLabel}>{currentPhaseName}</span>
              <Icons.ChevronDown className={openSelector === 'phase' ? styles.chevronUp : styles.chevronDown} size={14} />
            </button>
          </>
        ) : null}
      </div>
      {openSelector === 'mode' && visibleModes.length > 0 ? (
        <div className={styles.modeMenu}>
          {visibleModes.map(option => (
            <div className={option.disabled ? styles.menuItemDisabled : styles.menuItem} key={option.name}>
              <span className={styles.menuItemLabel}>{option.name}</span>
              {option.name === mode ? <Icons.Check className={styles.check} size={16} /> : null}
            </div>
          ))}
        </div>
      ) : null}
      {openSelector === 'phase' && phases.length > 0 ? (
        <div className={styles.phaseMenu}>
          {phases.map(option => (
            <div
              className={option.name === phase ? styles.menuItemActive : styles.menuItem}
              key={option.name}
              style={option.color ? {backgroundColor: `${option.color}33`} : undefined}
            >
              <span className={styles.phaseMenuLabel}>{option.name}</span>
              {option.name === phase ? <Icons.Check className={styles.check} size={16} /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
