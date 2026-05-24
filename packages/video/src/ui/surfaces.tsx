import type {CSSProperties, ReactNode} from 'react';
import {interpolate, spring, useVideoConfig} from 'remotion';
import {AppChrome} from './AppChrome';
import {theme} from './theme';
import {ease, mix, textReveal} from './timeline';

type SurfaceProps = {
  frame: number;
  standalone?: boolean;
  variant?: 'landscape' | 'square';
};

export function NotesSurface({frame, variant}: SurfaceProps) {
  const lineA = textReveal('demo different features with cinematic product scenes', frame, 34, 112);
  const lineB = textReveal('conversation becomes tickets, notes, code, and workflows', frame, 128, 198);
  const lineC = textReveal('same surface, same memory, no context handoff', frame, 168, 238);
  return (
    <AppChrome active="notes" variant={variant} breadcrumbs={['Notes', 'AgentBuddy', 'Tasklist', 'Current']} title="Notes" rightRail={<NotesRail />}>
      <div style={styles.notesGrid}>
        <aside style={styles.noteList}>
          {['📝 Tasklist', '🚧 default setup', '🔥 current', '✓ remotion', '✓ phone app', '🪲 bugs', '🗺️ V1 Roadmap'].map((item, index) => (
            <div key={item} style={{...styles.noteRow, ...(index === 2 ? styles.noteRowActive : undefined), opacity: index > 4 ? 0.72 : 1}}>
              {item}
            </div>
          ))}
        </aside>
        <article style={styles.noteDoc}>
          <div style={styles.notePath}>Notes › 🚀 AgentBuddy › 📝 Tasklist › 🔥 Current</div>
          <ul style={styles.ul}>
            <li>provocative posts</li>
            <li>3 clips a week for clientlabs yt</li>
            <li>{lineA}<Caret frame={frame} visible={frame < 116} /></li>
          </ul>
          <div style={styles.rule} />
          <ul style={{...styles.ul, color: '#e6fff8'}}>
            <li>{lineB}</li>
            <li>{lineC}<Caret frame={frame} visible={frame > 168 && frame < 242} /></li>
          </ul>
        </article>
      </div>
    </AppChrome>
  );
}

function NotesRail() {
  const groups = ['☆ FAVORITES', '🔥 current', '💻 cli', '🎬 Videos', '🌐 Clientlabs', '🚀 Agentbuddy', '📝 Tasklist', '⭐ Brand & Content'];
  return (
    <div>
      <div style={styles.railTitle}>Notes</div>
      {groups.map(item => (
        <div key={item} style={{...styles.railItem, ...(item.includes('Tasklist') ? styles.railItemActive : undefined)}}>{item}</div>
      ))}
    </div>
  );
}

export function ChatSurface({frame, variant}: SurfaceProps) {
  const prompt = textReveal('Turn this launch brief into tickets, notes, and a shippable PR plan.', frame, 24, 88);
  const work = ['Read launch memory', 'Create execution tickets', 'Draft code branch plan', 'Schedule release workflow'];
  return (
    <AppChrome active="chat" variant={variant} breadcrumbs={['Threads', 'Launch Thread']}>
      <div style={styles.chatSurface}>
        <Card style={{left: '6%', top: '10%', width: 220}}>
          <strong>Launch AgentBuddy</strong>
          <small style={styles.activeSmall}>ACTIVE</small>
        </Card>
        <div style={styles.userBubble}>{prompt}<Caret frame={frame} visible={frame < 90} /></div>
        <Card style={{left: '10%', top: '34%', width: 330}}>
          <div style={styles.muted}>Agent is working</div>
          {work.map((line, index) => (
            <div key={line} style={{...styles.workLine, opacity: ease(frame, 104 + index * 20, 122 + index * 20)}}>
              <span style={{...styles.statusDot, background: index === 3 ? theme.amber : theme.teal}} />
              <p>{line}</p>
            </div>
          ))}
        </Card>
        <Card style={{right: '6%', top: '16%', width: 430, opacity: ease(frame, 168, 206)}}>
          <div style={styles.artifactHead}><span>Launch Operating Plan</span><small>artifact</small></div>
          {['Capture launch context', 'Create execution tickets', 'Generate branch and PR plan', 'Automate release checks'].map((row, index) => (
            <div key={row} style={{...styles.artifactRow, opacity: ease(frame, 188 + index * 16, 204 + index * 16)}}>
              <span>{row}</span>
              <small style={{color: index < 2 ? theme.green : index === 2 ? theme.teal : theme.muted}}>{index < 2 ? 'done' : index === 2 ? 'active' : 'queued'}</small>
            </div>
          ))}
        </Card>
        <Cursor frame={frame} from={[48, 30]} to={[78, 36]} start={80} end={190} />
      </div>
    </AppChrome>
  );
}

export function BoardSurface({frame, variant}: SurfaceProps) {
  const p = ease(frame, 70, 170);
  return (
    <AppChrome active="board" variant={variant} breadcrumbs={['Threads', 'Board']}>
      <div style={styles.boardSurface}>
        {['Backlog', 'In Progress', 'Done'].map((column, index) => (
          <section key={column} style={styles.boardColumn}>
            <header style={styles.boardHeader}><span>{column}</span><small>{index === 1 ? 2 : index === 0 ? 1 : 0}</small></header>
            {index === 0 ? <TaskCard muted>Ship capture-state renderer</TaskCard> : null}
            {index === 1 ? <TaskCard>Automate release checks</TaskCard> : null}
          </section>
        ))}
        <div style={{...styles.movingTask, left: `${mix(8, 40, p)}%`, top: `${mix(34, 24, p)}%`, transform: `rotate(${mix(-2, 1, p)}deg)`}}>
          <TaskCard active>Publish launch film cutdown</TaskCard>
        </div>
      </div>
    </AppChrome>
  );
}

export function CodeSurface({frame, variant}: SurfaceProps) {
  const files = ['src/demo/timeline.ts', 'src/ui/AppShell.tsx', 'src/shots/Workflow.tsx'];
  const lines = [
    ['+', 'export const launchMoments = createTimeline({'],
    ['+', '  chat: streamConversation(becomesWork),'],
    ['+', '  code: generateCommitAndPullRequest(),'],
    ['-', '  screenshots: panAcrossStaticFrames(),'],
    ['+', '  workflow: activateReleaseAutomation(),'],
    ['+', '});'],
  ];
  return (
    <AppChrome active="code" variant={variant} breadcrumbs={['Code', 'Launch Film', 'Branch']}>
      <div style={styles.codeGrid}>
        <aside style={styles.fileList}>
          <div style={styles.panelLabel}>Changed files</div>
          {files.map((file, index) => <div key={file} style={{...styles.fileRow, ...(index === 1 ? styles.fileRowActive : undefined)}}>{file}</div>)}
        </aside>
        <section style={styles.diffView}>
          <header style={styles.diffHead}><span>AppShell.tsx</span><small>{Math.round(mix(0, 6, ease(frame, 58, 132)))} changes</small></header>
          {lines.map(([kind, line], index) => (
            <pre key={line} style={{...styles.diffLine, ...(kind === '+' ? styles.addLine : styles.removeLine), opacity: ease(frame, 46 + index * 15, 64 + index * 15)}}>{kind} {line}</pre>
          ))}
          <Card style={{position: 'relative', marginTop: 28, opacity: ease(frame, 178, 220)}}>
            <small style={styles.panelLabel}>Generated commit</small>
            <strong>feat(video): build Remotion-native launch film</strong>
          </Card>
        </section>
        <aside style={styles.shipList}>
          {['branch published', 'checks passed', 'PR created'].map((item, index) => <div key={item} style={{...styles.shipRow, opacity: ease(frame, 216 + index * 22, 236 + index * 22)}}>{item}</div>)}
        </aside>
      </div>
    </AppChrome>
  );
}

export function WorkflowSurface({frame, variant}: SurfaceProps) {
  const nodes = [
    ['Command', 18, 32],
    ['Context', 42, 52],
    ['Actions', 64, 32],
    ['Release', 78, 58],
  ] as const;
  const {fps} = useVideoConfig();
  return (
    <AppChrome active="workflow" variant={variant} breadcrumbs={['Flows', 'Release Automation']}>
      <div style={styles.workflowSurface}>
        <svg style={styles.flowSvg}>
          {nodes.slice(0, -1).map((node, index) => {
            const next = nodes[index + 1];
            const p = ease(frame, 62 + index * 30, 92 + index * 30);
            return <line key={node[0]} x1={`${node[1]}%`} y1={`${node[2]}%`} x2={`${mix(node[1], next[1], p)}%`} y2={`${mix(node[2], next[2], p)}%`} stroke="rgba(45,212,191,.62)" strokeWidth="2" />;
          })}
        </svg>
        {nodes.map((node, index) => {
          const scale = spring({frame: frame - 34 - index * 26, fps, config: {damping: 18, stiffness: 120}});
          return <div key={node[0]} style={{...styles.flowNode, left: `${node[1]}%`, top: `${node[2]}%`, opacity: ease(frame, 34 + index * 26, 52 + index * 26), transform: `translate(-50%, -50%) scale(${scale})`}}>{node[0]}</div>;
        })}
        <Card style={{right: '8%', top: '18%', width: 290, opacity: ease(frame, 190, 232)}}>
          <small style={styles.panelLabel}>Command listener</small>
          <strong style={{fontFamily: theme.mono, fontSize: 22}}>/launch-week</strong>
        </Card>
      </div>
    </AppChrome>
  );
}

export function MontageSurface({frame, variant}: SurfaceProps) {
  const items = ['Memory graph updated', 'Execution stream visible', 'Knowledge query returned', 'Defaults personalized', 'Threads dashboard', 'Workflow completed'];
  const active = Math.min(items.length - 1, Math.floor(frame / 58));
  return (
    <AppChrome active="montage" variant={variant} breadcrumbs={['System', 'Montage']}>
      <div style={styles.montageGrid}>
        {items.map((item, index) => (
          <div key={item} style={{...styles.montageCard, ...(index === active ? styles.montageCardActive : undefined)}}>
            <small>0{index + 1}</small>
            <strong>{item}</strong>
            <span style={{...styles.montageProgress, width: index === active ? `${mix(8, 100, ease(frame % 58, 0, 48))}%` : '14%'}} />
          </div>
        ))}
      </div>
    </AppChrome>
  );
}

export function FinalSurface({frame, variant}: SurfaceProps) {
  return (
    <AppChrome active="final" variant={variant} breadcrumbs={['AgentBuddy']} title="Launch Film">
      <div style={styles.finalSurface}>
        <h1 style={{...styles.finalTitle, opacity: ease(frame, 24, 70), transform: `translateY(${interpolate(ease(frame, 24, 70), [0, 1], [20, 0])}px)`}}>AgentBuddy</h1>
        <p style={{...styles.finalSub, opacity: ease(frame, 52, 94)}}>The AI operating system for modern work.</p>
      </div>
    </AppChrome>
  );
}

export function SurfaceFrame({children}: {children: ReactNode}) {
  return <div style={{position: 'absolute', inset: 0, background: '#07090b', fontFamily: theme.font, color: theme.text}}>{children}</div>;
}

function Card({children, style}: {children: ReactNode; style?: CSSProperties}) {
  return <div style={{...styles.card, ...style}}>{children}</div>;
}

function TaskCard({children, active, muted}: {children: ReactNode; active?: boolean; muted?: boolean}) {
  return <div style={{...styles.taskCard, ...(active ? styles.taskActive : undefined), opacity: muted ? 0.55 : 1}}>{children}<small style={styles.taskTag}>launch</small></div>;
}

function Cursor({frame, from, to, start, end}: {frame: number; from: [number, number]; to: [number, number]; start: number; end: number}) {
  const p = ease(frame, start, end);
  const curve = Math.sin(p * Math.PI) * 18;
  return <div style={{...styles.cursor, left: `${mix(from[0], to[0], p)}%`, top: `${mix(from[1], to[1], p)}%`, transform: `translate(${curve}px, ${curve * -0.25}px)`}} />;
}

function Caret({frame, visible}: {frame: number; visible: boolean}) {
  if (!visible) return null;
  return <span style={{opacity: Math.sin(frame * 0.55) > 0 ? 1 : 0.15}}>_</span>;
}

const styles: Record<string, CSSProperties> = {
  notesGrid: {height: '100%', display: 'grid', gridTemplateColumns: '250px 1fr'},
  noteList: {borderRight: `1px solid ${theme.border}`, padding: 16, background: '#191919'},
  noteRow: {padding: '8px 10px', borderRadius: 7, color: theme.text2, fontSize: 16},
  noteRowActive: {background: '#444', color: '#fff'},
  noteDoc: {padding: '34px 56px', color: theme.text, fontSize: 17, lineHeight: 1.65},
  notePath: {color: theme.text, fontSize: 15, textTransform: 'uppercase', marginBottom: 16},
  ul: {margin: 0, paddingLeft: 22},
  rule: {height: 1, background: theme.border2, margin: '28px 0'},
  railTitle: {fontSize: 16, color: theme.text, marginBottom: 24},
  railItem: {padding: '10px 12px', borderRadius: 6, color: theme.muted, fontSize: 16},
  railItemActive: {background: '#4a4a4a', color: '#fff'},
  chatSurface: {position: 'absolute', inset: 0},
  card: {position: 'absolute', padding: 16, background: '#202020', border: `1px solid ${theme.border2}`, borderRadius: 8, color: theme.text},
  activeSmall: {display: 'block', color: theme.teal, marginTop: 7},
  muted: {color: theme.muted, marginBottom: 12},
  userBubble: {position: 'absolute', right: '9%', top: '22%', maxWidth: 520, padding: '13px 15px', borderRadius: 8, border: `1px solid ${theme.border2}`, background: '#1e293b', color: theme.text},
  workLine: {display: 'flex', alignItems: 'center', gap: 9, margin: '9px 0'},
  statusDot: {width: 7, height: 7, borderRadius: 999, display: 'block'},
  artifactHead: {display: 'flex', justifyContent: 'space-between', color: theme.muted, marginBottom: 12},
  artifactRow: {display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: `1px solid ${theme.border2}`},
  cursor: {position: 'absolute', width: 0, height: 0, borderLeft: '8px solid white', borderBottom: '20px solid transparent', filter: 'drop-shadow(0 8px 14px rgba(0,0,0,.7))'},
  boardSurface: {position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, padding: 26},
  boardColumn: {border: `1px solid ${theme.border2}`, borderRadius: 8, padding: 14, background: '#191919'},
  boardHeader: {display: 'flex', justifyContent: 'space-between', marginBottom: 14, fontWeight: 700},
  taskCard: {padding: 14, marginBottom: 10, borderRadius: 7, background: '#202020', border: `1px solid ${theme.border2}`, color: theme.text},
  taskActive: {borderColor: 'rgba(45,212,191,.5)', background: 'rgba(20,184,166,.16)', boxShadow: '0 24px 70px rgba(0,0,0,.42)'},
  taskTag: {display: 'block', marginTop: 10, color: theme.muted},
  movingTask: {position: 'absolute', width: 300},
  codeGrid: {height: '100%', display: 'grid', gridTemplateColumns: '270px 1fr 285px'},
  fileList: {padding: 18, borderRight: `1px solid ${theme.border}`},
  panelLabel: {display: 'block', color: theme.muted, textTransform: 'uppercase', fontSize: 12, marginBottom: 10},
  fileRow: {padding: '10px 12px', marginBottom: 8, borderRadius: 7, background: '#202020', color: theme.text2, fontSize: 13},
  fileRowActive: {background: '#134e4a', color: '#fff'},
  diffView: {padding: 26, fontFamily: theme.mono},
  diffHead: {display: 'flex', justifyContent: 'space-between', color: theme.muted, marginBottom: 20},
  diffLine: {margin: 0, padding: '7px 10px', fontSize: 14},
  addLine: {color: '#bbf7d0', background: 'rgba(22,101,52,.28)'},
  removeLine: {color: '#fecaca', background: 'rgba(127,29,29,.32)'},
  shipList: {padding: 18, borderLeft: `1px solid ${theme.border}`},
  shipRow: {padding: '12px 13px', marginBottom: 10, borderRadius: 7, background: '#202020', border: `1px solid ${theme.border2}`},
  workflowSurface: {position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.08) 1px, transparent 1px)', backgroundSize: '22px 22px'},
  flowSvg: {position: 'absolute', inset: 0, width: '100%', height: '100%'},
  flowNode: {position: 'absolute', width: 128, height: 46, display: 'grid', placeItems: 'center', background: '#202020', border: '1px solid rgba(45,212,191,.5)', boxShadow: '0 0 42px rgba(45,212,191,.18)', fontWeight: 700},
  montageGrid: {position: 'absolute', inset: 0, padding: 26, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16},
  montageCard: {padding: 18, border: `1px solid ${theme.border2}`, background: '#202020', opacity: 0.45},
  montageCardActive: {opacity: 1, borderColor: 'rgba(45,212,191,.55)', background: 'rgba(20,184,166,.14)'},
  montageProgress: {display: 'block', height: 4, marginTop: 28, background: theme.teal},
  finalSurface: {position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center', background: 'radial-gradient(circle at 50% 45%, rgba(45,212,191,.12), transparent 35%), #181818'},
  finalTitle: {margin: 0, fontSize: 88, lineHeight: .95, fontWeight: 820},
  finalSub: {marginTop: 22, color: theme.text2, fontSize: 30},
};
