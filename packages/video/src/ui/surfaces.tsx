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
      <div className="ab-notes-grid">
        <aside className="ab-notes-list">
          {['📝 Tasklist', '🚧 default setup', '🔥 current', '✓ remotion', '✓ phone app', '🪲 bugs', '🗺️ V1 Roadmap'].map((item, index) => (
            <div key={item} className={`ab-note-tree-row ${index === 2 ? 'is-active' : ''}`} style={{opacity: index > 4 ? 0.72 : 1}}>
              {item}
            </div>
          ))}
        </aside>
        <article className="ab-note-doc">
          <div className="ab-note-path">Notes › 🚀 AgentBuddy › 📝 Tasklist › 🔥 Current</div>
          <ul className="ab-note-list">
            <li>provocative posts</li>
            <li>3 clips a week for clientlabs yt</li>
            <li>{lineA}<Caret frame={frame} visible={frame < 116} /></li>
          </ul>
          <div className="ab-rule" />
          <ul className="ab-note-list ab-note-list-connected">
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
      <div className="ab-rail-title">Notes</div>
      {groups.map(item => (
        <div key={item} className={`ab-rail-item ${item.includes('Tasklist') ? 'is-active' : ''}`}>{item}</div>
      ))}
    </div>
  );
}

export function ChatSurface({frame, variant}: SurfaceProps) {
  const prompt = textReveal('Turn this launch brief into tickets, notes, and a shippable PR plan.', frame, 24, 88);
  const work = ['Read launch memory', 'Create execution tickets', 'Draft code branch plan', 'Schedule release workflow'];
  return (
    <AppChrome active="chat" variant={variant} breadcrumbs={['Threads', 'Launch Thread']}>
      <div className="ab-thread-surface">
        <Card className="ab-thread-card ab-launch-card" style={{left: '6%', top: '10%', width: 220}}>
          <strong>Launch AgentBuddy</strong>
          <small className="ab-active-small">ACTIVE</small>
        </Card>
        <div className="ab-user-bubble">{prompt}<Caret frame={frame} visible={frame < 90} /></div>
        <Card className="ab-thread-card" style={{left: '10%', top: '34%', width: 330}}>
          <div className="ab-muted">Agent is working</div>
          {work.map((line, index) => (
            <div key={line} className="ab-work-line" style={{opacity: ease(frame, 104 + index * 20, 122 + index * 20)}}>
              <span className={`ab-status-dot ${index === 3 ? 'is-warn' : ''}`} />
              <p>{line}</p>
            </div>
          ))}
        </Card>
        <Card className="ab-thread-card" style={{right: '6%', top: '16%', width: 430, opacity: ease(frame, 168, 206)}}>
          <div className="ab-artifact-head"><span>Launch Operating Plan</span><small>artifact</small></div>
          {['Capture launch context', 'Create execution tickets', 'Generate branch and PR plan', 'Automate release checks'].map((row, index) => (
            <div key={row} className="ab-artifact-row" style={{opacity: ease(frame, 188 + index * 16, 204 + index * 16)}}>
              <span>{row}</span>
              <small className={index < 2 ? 'is-done' : index === 2 ? 'is-active' : ''}>{index < 2 ? 'done' : index === 2 ? 'active' : 'queued'}</small>
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
      <div className="ab-board-surface">
        {['Backlog', 'In Progress', 'Done'].map((column, index) => (
          <section key={column} className="ab-board-column">
            <header className="ab-board-header"><span>{column}</span><small>{index === 1 ? 2 : index === 0 ? 1 : 0}</small></header>
            {index === 0 ? <TaskCard muted>Ship capture-state renderer</TaskCard> : null}
            {index === 1 ? <TaskCard>Automate release checks</TaskCard> : null}
          </section>
        ))}
        <div className="ab-moving-task" style={{left: `${mix(8, 40, p)}%`, top: `${mix(34, 24, p)}%`, transform: `rotate(${mix(-2, 1, p)}deg)`}}>
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
      <div className="ab-code-grid">
        <aside className="ab-code-panel">
          <div className="ab-panel-label">Changed files</div>
          {files.map((file, index) => <div key={file} className={`ab-file-row ${index === 1 ? 'is-active' : ''}`}>{file}</div>)}
        </aside>
        <section className="ab-diff-view">
          <header className="ab-diff-head"><span>AppShell.tsx</span><small>{Math.round(mix(0, 6, ease(frame, 58, 132)))} changes</small></header>
          {lines.map(([kind, line], index) => (
            <pre key={line} className={`ab-diff-line ${kind === '+' ? 'is-add' : 'is-remove'}`} style={{opacity: ease(frame, 46 + index * 15, 64 + index * 15)}}>{kind} {line}</pre>
          ))}
          <Card className="ab-thread-card ab-commit-card" style={{position: 'relative', marginTop: 28, opacity: ease(frame, 178, 220)}}>
            <small className="ab-panel-label">Generated commit</small>
            <strong>feat(video): build Remotion-native launch film</strong>
          </Card>
        </section>
        <aside className="ab-code-ship-list">
          {['branch published', 'checks passed', 'PR created'].map((item, index) => <div key={item} className="ab-ship-row" style={{opacity: ease(frame, 216 + index * 22, 236 + index * 22)}}>{item}</div>)}
        </aside>
      </div>
    </AppChrome>
  );
}

export function WorkflowSurface({frame, variant}: SurfaceProps) {
  const nodes = [
    ['Command', 'trigger', 24, 28, ''],
    ['Context', 'action', 47, 52, ''],
    ['Actions', 'fire', 70, 28, ''],
  ] as const;
  const {fps} = useVideoConfig();
  return (
    <AppChrome active="workflow" variant={variant} breadcrumbs={['Flows', 'Release Automation']}>
      <div className="ab-flow-canvas ab-flow-canvas-reference">
        <section className="ab-flow-editor ab-flow-editor-reference">
          <svg className="ab-flow-edges" viewBox="0 0 100 100" preserveAspectRatio="none">
            {[[0, 1], [1, 2]].map(([from, to], index) => {
              const a = nodes[from];
              const b = nodes[to];
              const p = ease(frame, 62 + index * 28, 92 + index * 28);
              const x2 = mix(a[2], b[2], p);
              const y2 = mix(a[3], b[3], p);
              return <path key={`${a[0]}-${b[0]}`} d={`M ${a[2]} ${a[3]} L ${x2} ${y2}`} vectorEffect="non-scaling-stroke" />;
            })}
          </svg>
        {nodes.map((node, index) => {
          const scale = spring({frame: frame - 34 - index * 26, fps, config: {damping: 18, stiffness: 120}});
          return (
            <div
              key={node[0]}
              className="ab-flow-node ab-flow-node-reference"
              data-kind={node[1]}
              style={{left: `${node[2]}%`, top: `${node[3]}%`, opacity: ease(frame, 34 + index * 26, 52 + index * 26), transform: `translate(-50%, -50%) scale(${scale})`}}
            >
              <div className="ab-flow-node-label">{node[0]}</div>
            </div>
          );
        })}
        </section>
      </div>
    </AppChrome>
  );
}

export function MontageSurface({frame, variant}: SurfaceProps) {
  const items = ['Memory graph updated', 'Execution stream visible', 'Knowledge query returned', 'Defaults personalized', 'Threads dashboard', 'Workflow completed'];
  const active = Math.min(items.length - 1, Math.floor(frame / 58));
  return (
    <AppChrome active="montage" variant={variant} breadcrumbs={['System', 'Montage']}>
      <div className="ab-montage-grid">
        {items.map((item, index) => (
          <div key={item} className={`ab-montage-card ${index === active ? 'is-active' : ''}`}>
            <small>0{index + 1}</small>
            <strong>{item}</strong>
            <span className="ab-montage-progress" style={{width: index === active ? `${mix(8, 100, ease(frame % 58, 0, 48))}%` : '14%'}} />
          </div>
        ))}
      </div>
    </AppChrome>
  );
}

export function FinalSurface({frame, variant}: SurfaceProps) {
  return (
    <AppChrome active="final" variant={variant} breadcrumbs={['AgentBuddy']} title="Launch Film">
      <div className="ab-final-surface">
        <h1 className="ab-final-title" style={{opacity: ease(frame, 24, 70), transform: `translateY(${interpolate(ease(frame, 24, 70), [0, 1], [20, 0])}px)`}}>AgentBuddy</h1>
        <p className="ab-final-sub" style={{opacity: ease(frame, 52, 94)}}>The AI operating system for modern work.</p>
      </div>
    </AppChrome>
  );
}

export function SurfaceFrame({children}: {children: ReactNode}) {
  return <div style={{position: 'absolute', inset: 0, background: '#07090b', fontFamily: theme.font, color: theme.text}}>{children}</div>;
}

function Card({children, style, className = ''}: {children: ReactNode; style?: CSSProperties; className?: string}) {
  return <div className={className} style={style}>{children}</div>;
}

function TaskCard({children, active, muted}: {children: ReactNode; active?: boolean; muted?: boolean}) {
  return <div className={`ab-task-card ${active ? 'is-active' : ''}`} style={{opacity: muted ? 0.55 : 1}}>{children}<small>launch</small></div>;
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
  montageGrid: {position: 'absolute', inset: 0, padding: 26, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16},
  montageCard: {padding: 18, border: `1px solid ${theme.border2}`, background: '#202020', opacity: 0.45},
  montageCardActive: {opacity: 1, borderColor: 'rgba(45,212,191,.55)', background: 'rgba(20,184,166,.14)'},
  montageProgress: {display: 'block', height: 4, marginTop: 28, background: theme.teal},
  finalSurface: {position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center', background: 'radial-gradient(circle at 50% 45%, rgba(45,212,191,.12), transparent 35%), #181818'},
  finalTitle: {margin: 0, fontSize: 88, lineHeight: .95, fontWeight: 820},
  finalSub: {marginTop: 22, color: theme.text2, fontSize: 30},
};
