import type {CSSProperties, ReactNode} from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {ChatComposerState} from '../chat/chatTypes';
import {ChatComposer} from '../chat/ChatComposer';
import {CanvasHeader} from './CanvasHeader';
import {Toolbar, type PluginId} from './Toolbar';
import {WindowTrafficLights} from './WindowTrafficLights';
import styles from './AppWindow.module.css';

type Variant = 'landscape' | 'square';

type AppWindowProps = {
  activePlugin: PluginId;
  breadcrumbs: string[];
  children: ReactNode;
  composer?: ChatComposerState | false;
  rightRail?: ReactNode;
  title?: string;
  variant?: Variant;
};

export function AppWindow({activePlugin, breadcrumbs, children, composer, rightRail, title, variant = 'landscape'}: AppWindowProps) {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 25, stiffness: 110}});
  const square = variant === 'square' || width === height;
  const marginX = square ? 42 : 32;
  const marginTop = square ? 54 : 32;
  const marginBottom = square ? 92 : 32;
  const windowStyle: CSSProperties = {
    left: marginX,
    top: marginTop,
    width: width - marginX * 2,
    height: height - marginTop - marginBottom,
    transform: `translateY(${interpolate(enter, [0, 1], [16, 0])}px) scale(${interpolate(enter, [0, 1], [.986, 1])})`,
  };
  const gridStyle: CSSProperties = {
    gridTemplateColumns: rightRail && !square ? '72px minmax(0, 1fr) 368px' : '72px minmax(0, 1fr)',
  };

  return (
    <div className={styles.window} style={windowStyle}>
      <WindowTrafficLights />
      <div className={styles.grid} style={gridStyle}>
        <Toolbar activePlugin={activePlugin} />
        <main className={styles.main}>
          <CanvasHeader breadcrumbs={breadcrumbs} title={title} />
          <section className={styles.surface}>{children}</section>
          {composer === false ? null : <ChatComposer state={composer ?? {placeholder: 'Message Agent', mode: 'Codex', phase: 'Plan'}} />}
        </main>
        {rightRail && !square ? <aside className={styles.rightRail}>{rightRail}</aside> : null}
      </div>
    </div>
  );
}

