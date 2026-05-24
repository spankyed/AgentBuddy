import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {Cursor} from '../../agentbuddy-ui/primitives/Cursor';
import {ArtifactChecklist} from '../../agentbuddy-ui/threads/ArtifactChecklist';
import {AgentWorkList} from '../../agentbuddy-ui/threads/AgentWorkList';
import {ThreadCard} from '../../agentbuddy-ui/threads/ThreadCard';
import {textReveal} from '../state/timeline';
import {Caret} from './Caret';
import './ChatShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';
const styles = makeStyles('ChatShot');

export function ChatShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const prompt = textReveal('Turn this launch brief into tickets, notes, and a shippable PR plan.', frame, 24, 88);
  const work = ['Read launch memory', 'Create execution tickets', 'Draft code branch plan', 'Schedule release workflow'];
  const artifactRows = ['Capture launch context', 'Create execution tickets', 'Generate branch and PR plan', 'Automate release checks'];
  return (
    <AppWindow activePlugin="threads" variant={variant} breadcrumbs={['Threads', 'Launch Thread']}>
      <div className={styles.root}>
        <ThreadCard style={{left: '6%', top: '10%', width: 220}}>
          <strong>Launch AgentBuddy</strong>
          <small className={styles.active}>ACTIVE</small>
        </ThreadCard>
        <div className={styles.userBubble}>{prompt}<Caret frame={frame} visible={frame < 90} /></div>
        <ThreadCard style={{left: '10%', top: '34%', width: 330}}><AgentWorkList frame={frame} items={work} /></ThreadCard>
        <ThreadCard style={{right: '6%', top: '16%', width: 430}}><ArtifactChecklist frame={frame} rows={artifactRows} /></ThreadCard>
        <Cursor frame={frame} from={[48, 30]} to={[78, 36]} start={80} end={190} />
      </div>
    </AppWindow>
  );
}

