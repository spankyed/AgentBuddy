import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {ApprovalBlockState, ApprovalOptionState} from './threadTypes';
import './ApprovalBlock.module.css';

const styles = makeStyles('ApprovalBlock');

// Mirrors packages/renderer/src/plugins/threads/chat/interactions/inputs/ApprovalButtons.vue.
export function ApprovalBlock({state}: {state: ApprovalBlockState}) {
  const isDisabled = Boolean(state.disabled || state.requireReason && !state.reason?.trim());

  if (state.disabled && state.response) {
    const approved = state.response.approved;
    const Icon = approved ? Icons.CircleCheck : Icons.CircleX;
    return (
      <div className={styles.root}>
        <div className={approved ? `${styles.response} ${styles.approved}` : `${styles.response} ${styles.denied}`}>
          <Icon size={20} />
          <span>{approved ? 'Approved' : 'Denied'}</span>
        </div>
        {state.response.reason ? (
          <div className={styles.reasonBox}>
            <small>Reason:</small>
            {state.response.reason}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {state.requireReason || state.allowReason ? (
        <div className={styles.reason}>
          <label>Reason {state.requireReason ? '(required)' : '(optional)'}:</label>
          <textarea className={state.disabled ? styles.textareaDisabled : styles.textarea} disabled={state.disabled} placeholder={state.reasonPlaceholder ?? 'Enter your reason...'} readOnly value={state.reason ?? ''} />
        </div>
      ) : null}
      <div className={styles.actions}>
        {state.autoAcceptOption ? (
          <label className={styles.autoAccept}>
            <input className={styles.checkbox} readOnly type="checkbox" />
            <span>Auto-accept file edits for session</span>
          </label>
        ) : null}
        {state.options ? (
          state.options.map(option => <ApprovalButton disabled={isDisabled} key={option.label} option={option} />)
        ) : (
          <>
            <ApprovalButton disabled={isDisabled} icon={Icons.CircleCheck} option={{label: state.approveLabel ?? 'Approve', variant: 'primary'}} />
            <ApprovalButton disabled={isDisabled} icon={Icons.CircleX} option={{label: state.denyLabel ?? 'Deny', variant: 'neutral'}} />
          </>
        )}
      </div>
    </div>
  );
}

function ApprovalButton({disabled, icon: Icon, option}: {disabled?: boolean; icon?: typeof Icons.CircleCheck; option: ApprovalOptionState}) {
  const className = disabled
    ? styles.buttonDisabled
    : option.variant === 'primary'
    ? styles.buttonPrimary
    : option.variant === 'danger'
      ? styles.buttonDanger
      : option.variant === 'secondary'
        ? styles.buttonSecondary
        : styles.button;
  return (
    <button className={className} disabled={disabled} type="button">
      {Icon ? <Icon size={16} /> : null}
      {option.label}
    </button>
  );
}
