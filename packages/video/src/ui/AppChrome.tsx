import type {CSSProperties, ReactNode} from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
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
  ['threads', '▣', 'Threads'],
  ['notes', '▤', 'Notes'],
  ['code', '</>', 'Code'],
  ['workflow', '⌘', 'Flows'],
  ['board', '▷', 'Board'],
  ['montage', '✦', 'Brain'],
  ['final', '◉', 'Settings'],
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
    transform: `translateY(${interpolate(enter, [0, 1], [16, 0])}px) scale(${interpolate(enter, [0, 1], [.986, 1])})`,
  };
  const gridStyle: CSSProperties = {gridTemplateColumns: rightRail && !square ? '72px minmax(0, 1fr) 368px' : '72px minmax(0, 1fr)'};

  return (
    <div className="ab-app-window" style={appStyle}>
      <TrafficLights />
      <div className="ab-app-grid" style={gridStyle}>
        <aside className="ab-toolbar">
          <div className="ab-toolbar-scroll">
          {nav.map(([id, label, title]) => (
            <div key={id} className={`ab-nav-button ${activeNav(active) === id ? 'is-active' : ''}`} title={title}>
              {label}
            </div>
          ))}
          </div>
        </aside>
        <main className="ab-main">
          <header className="ab-canvas-header">
            <nav className="ab-breadcrumbs" aria-label="Breadcrumb">
              <span className="ab-menu-dot">⋮</span>
              {breadcrumbs.map((crumb, index) => (
              <span key={`${crumb}-${index}`} className="ab-crumb">
                {index > 0 ? <span className="ab-chevron">›</span> : null}
                {crumb}
              </span>
            ))}
            </nav>
            {title ? <div className="ab-header-title">{title}</div> : null}
          </header>
          <section className="ab-surface">{children}</section>
          <Composer />
        </main>
        {rightRail && !square ? <aside className="ab-right-rail">{rightRail}</aside> : null}
      </div>
    </div>
  );
}

function TrafficLights() {
  return (
    <div className="ab-traffic">
      <span className="ab-traffic-dot is-red" />
      <span className="ab-traffic-dot is-yellow" />
      <span className="ab-traffic-dot is-green" />
    </div>
  );
}

function Composer() {
  return (
    <footer className="ab-composer-area">
      <div className="ab-composer">
        <span className="ab-placeholder">Message Agent</span>
        <div className="ab-composer-controls">
          <span>Codex</span>
          <button className="ab-mode-button">Plan</button>
          <button className="ab-send-button">Send ↵</button>
        </div>
      </div>
      <div className="ab-bottom-tabs">
        <span>Recent Threads</span>
        <span>AgentBuddy launch film</span>
        <span>+ New thread</span>
      </div>
    </footer>
  );
}
