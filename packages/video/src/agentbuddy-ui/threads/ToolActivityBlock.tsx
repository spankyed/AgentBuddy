import {ease} from '../../film/state/timeline';
import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {ToolActivityItemState} from './threadTypes';
import './ToolActivityBlock.module.css';

const styles = makeStyles('ToolActivityBlock');

// Mirrors packages/renderer/src/plugins/threads/chat/interactions/blocks/ToolActivityBlock.vue.
export function ToolActivityBlock({frame, items}: {frame: number; items: ToolActivityItemState[]}) {
  const visibleItems = items.filter((_, index) => ease(frame, 78 + index * 18, 96 + index * 18) > 0);
  const preview = visibleItems[visibleItems.length - 1] ?? items[0];
  const running = items.some((item) => item.status === 'running');
  const label = running ? 'Planning' : `Ran ${Math.max(visibleItems.length, 1)} tools`;
  return (
    <div className={styles.root}>
      <button className={styles.header} type="button">
        <Icons.ChevronRight className={styles.chevronOpen} size={16} />
        <Icons.Wrench className={styles.wrench} size={16} />
        <span className={styles.label}>{label}</span>
        {running ? (
          <span className={styles.streamingDots} aria-hidden>
            <span />
            <span />
            <span />
          </span>
        ) : null}
        <span className={styles.spacer} />
        {preview ? (
          <>
            <span className={styles.previewTool}>{preview.tool}</span>
            <span className={styles.previewSummary}>{preview.summary}</span>
          </>
        ) : null}
      </button>
      {!running ? (
        <button className={styles.artifactLink} type="button">
          <Icons.ArrowRight size={12} />
          <span>View changes (Launch Operating Plan)</span>
        </button>
      ) : null}
      <div className={styles.list}>
        {items.map((item, index) => (
          <div
            key={`${item.tool}-${item.summary}`}
            className={styles.row}
            data-status={item.status}
            style={{opacity: ease(frame, 78 + index * 18, 96 + index * 18)}}
          >
            <StatusIcon status={item.status} />
            <span className={styles.tool}>{item.tool}</span>
            <div className={styles.summaryStack}>
              <span className={styles.summary}>{item.summary}</span>
              {item.outputSummary && item.status !== 'running' ? <span className={styles.output}>{item.outputSummary}</span> : null}
            </div>
            <small>{item.status === 'running' ? 'running' : formatDuration(item.durationMs)}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusIcon({status}: {status: ToolActivityItemState['status']}) {
  if (status === 'ok') return <Icons.Check className={styles.statusOk} size={12} />;
  if (status === 'running') return <Icons.Loader2 className={styles.statusRunning} size={12} />;
  if (status === 'denied') return <Icons.X className={styles.statusMuted} size={12} />;
  return <Icons.AlertCircle className={styles.statusError} size={12} />;
}

function formatDuration(durationMs?: number) {
  if (durationMs == null) return '';
  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}s`;
  const mins = Math.floor(durationMs / 60_000);
  const secs = Math.round((durationMs % 60_000) / 1000);
  return `${mins}m${secs}s`;
}
