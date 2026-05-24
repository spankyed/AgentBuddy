import type {CSSProperties, ReactNode} from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from './theme';
import type {SurfaceId} from './timeline';

type Variant = 'landscape' | 'square';

type AppChromeProps = {
  active: SurfaceId;
  breadcrumbs: string[];
  children: ReactNode;
  rightRail?: ReactNode;
  variant?: Variant;
  title?: string;
};

const nav = [
  ['threads', '▣'],
  ['notes', '▤'],
  ['code', '</>'],
  ['workflow', '⌘'],
  ['board', '▷'],
  ['montage', '✦'],
  ['final', '◉'],
] as const;

function activeNav(active: SurfaceId) {
  if (active === 'chat') return 'threads';
  if (active === 'final') return 'montage';
  return active;
}

export function AppChrome({active, breadcrumbs, children, rightRail, variant = 'landscape', title}: AppChromeProps) {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 25, stiffness: 110}});
  const square = variant === 'square' || width === height;
  const marginX = square ? 42 : 32;
  const marginTop = square ? 54 : 32;
  const marginBottom = square ? 92 : 32;
  const appStyle: CSSProperties = {
    position: 'absolute',
    left: marginX,
    top: marginTop,
    width: width - marginX * 2,
    height: height - marginTop - marginBottom,
    border: `1px solid ${theme.border2}`,
    borderRadius: 8,
    overflow: 'hidden',
    background: theme.bg,
    boxShadow: '0 48px 150px rgba(0,0,0,.58)',
    transform: `translateY(${interpolate(enter, [0, 1], [16, 0])}px) scale(${interpolate(enter, [0, 1], [.986, 1])})`,
  };
  const gridStyle: CSSProperties = {
    height: '100%',
    display: 'grid',
    gridTemplateColumns: rightRail && !square ? '72px minmax(0, 1fr) 368px' : '72px minmax(0, 1fr)',
  };

  return (
    <div style={appStyle}>
      <TrafficLights />
      <div style={gridStyle}>
        <aside style={styles.toolbar}>
          {nav.map(([id, label]) => (
            <div key={id} style={{...styles.navButton, ...(activeNav(active) === id ? styles.navButtonActive : undefined)}}>
              {label}
            </div>
          ))}
        </aside>
        <main style={styles.main}>
          <header style={styles.header}>
            <div style={styles.breadcrumbs}>{breadcrumbs.map((crumb, index) => (
              <span key={`${crumb}-${index}`} style={styles.crumb}>
                {index > 0 ? <span style={styles.chevron}>›</span> : null}
                {crumb}
              </span>
            ))}</div>
            {title ? <div style={styles.headerTitle}>{title}</div> : null}
          </header>
          <section style={styles.surface}>{children}</section>
          <Composer />
        </main>
        {rightRail && !square ? <aside style={styles.rightRail}>{rightRail}</aside> : null}
      </div>
    </div>
  );
}

function TrafficLights() {
  return (
    <div style={styles.traffic}>
      <span style={{...styles.dot, background: '#ff5f57'}} />
      <span style={{...styles.dot, background: '#ffbd2e'}} />
      <span style={{...styles.dot, background: '#28c840'}} />
    </div>
  );
}

function Composer() {
  return (
    <footer style={styles.chatArea}>
      <div style={styles.composer}>
        <span style={styles.placeholder}>Message Agent</span>
        <div style={styles.composerControls}>
          <span>Codex</span>
          <button style={styles.modeButton}>Plan</button>
          <button style={styles.sendButton}>Send ↵</button>
        </div>
      </div>
      <div style={styles.tabs}>
        <span>Recent Threads</span>
        <span>AgentBuddy launch film</span>
        <span>+ New thread</span>
      </div>
    </footer>
  );
}

const styles: Record<string, CSSProperties> = {
  traffic: {
    position: 'absolute',
    left: 14,
    top: 12,
    zIndex: 5,
    display: 'flex',
    gap: 8,
  },
  dot: {
    width: 11,
    height: 11,
    borderRadius: 999,
  },
  toolbar: {
    borderRight: `1px solid ${theme.border}`,
    paddingTop: 50,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 18,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    display: 'grid',
    placeItems: 'center',
    color: '#a3a3a8',
    fontSize: 18,
    fontWeight: 700,
  },
  navButtonActive: {
    background: theme.blue,
    color: '#fff',
    boxShadow: '0 0 24px rgba(30,111,217,.42)',
  },
  main: {
    minWidth: 0,
    display: 'grid',
    gridTemplateRows: '42px minmax(0, 1fr) 168px',
  },
  header: {
    borderBottom: `1px solid ${theme.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 18px 0 52px',
    background: '#171717',
  },
  breadcrumbs: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    color: theme.muted,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  crumb: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
  },
  chevron: {
    color: '#525252',
  },
  headerTitle: {
    color: theme.text2,
    fontSize: 14,
  },
  surface: {
    position: 'relative',
    minHeight: 0,
    overflow: 'hidden',
    background: '#181818',
  },
  chatArea: {
    borderTop: `1px solid ${theme.border}`,
    background: '#171717',
    padding: '22px 26px 0',
  },
  composer: {
    height: 86,
    border: `1px solid ${theme.border2}`,
    borderRadius: 8,
    background: '#202020',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 18px',
  },
  placeholder: {
    color: theme.dim,
    fontSize: 16,
  },
  composerControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    color: theme.text2,
    fontSize: 16,
  },
  modeButton: {
    border: 0,
    borderRadius: 6,
    background: '#303030',
    color: theme.text,
    padding: '8px 13px',
    font: 'inherit',
  },
  sendButton: {
    border: 0,
    borderRadius: 6,
    background: theme.blue2,
    color: theme.text,
    padding: '8px 13px',
    font: 'inherit',
  },
  tabs: {
    height: 42,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    color: theme.dim,
    fontSize: 13,
  },
  rightRail: {
    borderLeft: `1px solid ${theme.border}`,
    background: '#1a1a1a',
    padding: '48px 14px',
    overflow: 'hidden',
  },
};
