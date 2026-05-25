import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {BrainEvent} from './brainTypes';
import './BrainSurface.module.css';

const styles = makeStyles('BrainSurface');

export function WatchedEvents({events, pulsingEventType}: {events: BrainEvent[]; pulsingEventType?: string}) {
  return (
    <aside className={styles.eventsPanel}>
      <header className={styles.panelHeader}><h3>Watched Events</h3><span>{events.length} events</span></header>
      <div className={styles.eventList}>
        {events.length === 0 ? <EmptyEvents /> : events.map(event => <WatchedEvent key={event.id} event={event} active={pulsingEventType === event.eventType} />)}
      </div>
    </aside>
  );
}

function WatchedEvent({event, active}: {event: BrainEvent; active: boolean}) {
  const isSchedule = event.triggerType === 'schedule';
  const Icon = isSchedule ? Icons.Clock : Icons.Radio;
  return (
    <div className={`${styles.eventRow} ${active ? styles.eventRowActive : ''}`}>
      {active ? <><div className={styles.eventGlow} /><div className={styles.eventScan} /></> : null}
      <div className={styles.eventText}>
        <strong>{event.label}</strong>
        <span><code>{isSchedule ? event.cronExpression : event.eventType}</code><b>•</b>{isSchedule ? 'schedule' : event.scope}</span>
      </div>
      <div className={`${styles.eventIcon} ${isSchedule ? styles.eventIconSchedule : styles.eventIconListener}`}>
        {active ? <span className={styles.eventRipple} /> : null}
        <Icon size={14} />
      </div>
    </div>
  );
}

function EmptyEvents() {
  return (
    <div className={styles.emptyEvents}>
      <Icons.Radio size={24} />
      <p>No event listeners in this flow</p>
    </div>
  );
}
