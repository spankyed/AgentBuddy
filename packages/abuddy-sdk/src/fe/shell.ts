// The app shell as frontend code reaches it: what it may read and what it may ask. The shell is the host
// `application` feature's plugin, which lists the plugins, holds which is open and lays out the panels. Pack code
// uses `useShell()`; nothing outside the host holds the shell's actor.
import { getCurrentScope, onScopeDispose, shallowReadonly, shallowRef, type Ref } from 'vue'
import type { AnyActorRef } from 'xstate'
import type { Plugin } from './plugin.ts'
import { boundFeHost } from '../runtime/fe-host.ts'

/** An event for a plugin's actor */
export type PluginEvent = { type: string; [key: string]: unknown };

/** How the window's panels are laid out */
export interface ShellPanelSizes {
  /** The canvas's share of the main area's height, in percent */
  canvasHeight: number;
  /** The inspection panel's width in pixels; 0 while it's collapsed */
  inspectionWidth: number;
  /** The width to restore the inspection panel to after it was collapsed */
  previousInspectionWidth?: number;
  /** Whether the chat fills the main area, the canvas hidden */
  chatMaximized?: boolean;
}

/** The shell's state frontend code may read */
export interface HostShellState {
  /** Every registered plugin, in the order the tabs show them */
  plugins: readonly Plugin[];
  /** The plugin open in this window */
  activePlugin: Plugin;
  /** Which plugins' tabs show, by ref; a plugin absent from it shows */
  pluginVisibility: Readonly<Record<string, boolean>>;
  panelSizes: ShellPanelSizes;
}

/** The events frontend code may send the shell */
export type HostShellEvent =
  /**
   * Opens the plugin at a ref and hands its actor `events`. The shell waits for a plugin whose pack's frontend is
   * still loading, and reports a ref no pack provides once loading has settled.
   */
  | { type: 'OPEN_PLUGIN'; plugin: string; events: PluginEvent[] }
  | { type: 'RESIZE_PANEL'; panel: 'canvas' | 'inspection'; size: number }
  | { type: 'RESTORE_CHAT' }
  | { type: 'SET_PLUGIN_VISIBILITY'; plugin: string; visible: boolean }
  | { type: 'CLOSE_DEV_LETTER' }
  | { type: 'HOTKEYS_RECORDING_START' }
  | { type: 'HOTKEYS_RECORDING_END' };

/** A snapshot of the shell, as frontend code reads it */
export interface HostShellSnapshot {
  context: HostShellState;
  /** `'onboarding'` while the user hasn't finished onboarding */
  hasTag(tag: string): boolean;
}

/**
 * The shell's actor as the frontend port holds it. The host's shell is checked against this contract where it is
 * defined, so a change to either side fails the typecheck rather than a pack at runtime.
 */
export interface HostShell {
  getSnapshot(): HostShellSnapshot;
  subscribe(observer: (snapshot: HostShellSnapshot) => void): { unsubscribe(): void };
  send(event: HostShellEvent): void;
  /** The plugins' running actors, by ref */
  system: { get(id: string): AnyActorRef | undefined };
}

/** The shell, for a component or composable: its state as read-only refs, kept current, and what it may ask of it */
export interface Shell {
  plugins: Readonly<Ref<readonly Plugin[]>>;
  activePlugin: Readonly<Ref<Plugin>>;
  pluginVisibility: Readonly<Ref<Readonly<Record<string, boolean>>>>;
  panelSizes: Readonly<Ref<ShellPanelSizes>>;
  isOnboarding: Readonly<Ref<boolean>>;
  /** Shows the canvas again when the chat is maximized */
  restoreChat(): void;
  /** Sets the canvas's share of the main area's height, in percent (kept within 20–95) */
  resizeCanvas(size: number): void;
  /** Shows or hides the tab of the plugin at `ref`, in every window */
  setPluginVisible(ref: string, visible: boolean): void;
  /** Stops the app's hotkeys while a shortcut is being recorded, and starts them again */
  startHotkeyRecording(): void;
  endHotkeyRecording(): void;
  /** Closes the welcome letter and goes on with onboarding */
  closeDevLetter(): void;
}

/**
 * The app shell. Its refs follow the shell for as long as the calling scope lives (a component's setup, or an
 * effect scope), and stop following it when that scope is disposed. Outside a scope it throws: nothing would ever
 * stop the refs following the shell.
 */
export function useShell(): Shell {
  if (!getCurrentScope()) {
    throw new Error("useShell() runs in a component's setup or an effect scope (effectScope().run(() => useShell())): its refs follow the shell until that scope is disposed")
  }
  const shell = boundFeHost().application
  const read = (snapshot: HostShellSnapshot) => ({
    plugins: snapshot.context.plugins,
    activePlugin: snapshot.context.activePlugin,
    pluginVisibility: snapshot.context.pluginVisibility,
    panelSizes: snapshot.context.panelSizes,
    isOnboarding: snapshot.hasTag('onboarding'),
  })
  const initial = read(shell.getSnapshot())
  const refs = {
    plugins: shallowRef(initial.plugins),
    activePlugin: shallowRef(initial.activePlugin),
    pluginVisibility: shallowRef(initial.pluginVisibility),
    panelSizes: shallowRef(initial.panelSizes),
    isOnboarding: shallowRef(initial.isOnboarding),
  }
  const subscription = shell.subscribe((snapshot) => {
    const next = read(snapshot)
    // A ref changes only when its value does, so a component reading one field isn't re-rendered for another
    for (const key of Object.keys(refs) as Array<keyof typeof refs>) {
      if (refs[key].value !== next[key]) (refs[key] as Ref<unknown>).value = next[key]
    }
  })
  onScopeDispose(() => subscription.unsubscribe())

  return {
    plugins: shallowReadonly(refs.plugins),
    activePlugin: shallowReadonly(refs.activePlugin),
    pluginVisibility: shallowReadonly(refs.pluginVisibility),
    panelSizes: shallowReadonly(refs.panelSizes),
    isOnboarding: shallowReadonly(refs.isOnboarding),
    restoreChat: () => shell.send({ type: 'RESTORE_CHAT' }),
    resizeCanvas: (size) => shell.send({ type: 'RESIZE_PANEL', panel: 'canvas', size }),
    setPluginVisible: (ref, visible) => shell.send({ type: 'SET_PLUGIN_VISIBILITY', plugin: ref, visible }),
    startHotkeyRecording: () => shell.send({ type: 'HOTKEYS_RECORDING_START' }),
    endHotkeyRecording: () => shell.send({ type: 'HOTKEYS_RECORDING_END' }),
    closeDevLetter: () => shell.send({ type: 'CLOSE_DEV_LETTER' }),
  }
}
