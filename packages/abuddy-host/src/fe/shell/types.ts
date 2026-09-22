// The app shell's state, events and the I/O it's given. Its machine (machine.ts) reads the rest of the app only
// through these ports, so it runs the same in the renderer, over the API and the window, and in a pack's tests.
import type { ContextMenuItem, HotkeyEvent, Plugin, PluginEvent, ShellPanelSizes } from '@abuddy/sdk/fe';
import type { HostPluginEvents } from '@abuddy/sdk/events';
import type { ApplicationHotkeys } from '@abuddy/sdk/types';
import type { ShellClient } from '../client.ts';
import type { FePackRegistry } from '../pack-store.ts';
import type { LoadedPackEntry } from '../../packs/pack-layout.ts';
import type { BreadcrumbItem } from './trail.ts';

/** Loads and unloads external packs' frontends (the renderer imports them from `pack://`) */
export interface ShellPackFrontends {
  /** Loads a pack's frontend: the plugins it exports, or null for a pack with no frontend code. Throws when it fails */
  load(pack: LoadedPackEntry): Promise<Plugin[] | null>;
  /** Takes out what a pack's frontend registered */
  unload(packId: string): void;
}

/** Where the panel sizes the user sets are kept, so the next window opens with them */
export interface ShellStorage {
  loadPanelSizes(): Partial<ShellPanelSizes> | undefined;
  savePanelSizes(sizes: ShellPanelSizes): void;
}

/** How the shell tells the user something went wrong */
export interface ShellNotify {
  /** A toast */
  error(title: string, detail?: string): void;
  /** Replaces the window with the error page */
  errorPage(title: string, detail: string): void;
}

/** The I/O the shell is given */
export interface ShellOptions {
  /** This window's registered pack frontends: the plugins the shell starts with, and its default */
  packs: Pick<FePackRegistry, 'getRegisteredPlugins' | 'getRegisteredDefaultPlugin'>;
  client: ShellClient;
  packFrontends: ShellPackFrontends;
  storage: ShellStorage;
  notify: ShellNotify;
  /** Where the key and mouse listeners attach (the window); with none, none attach */
  target?: EventTarget;
}

/** What a window's shell starts with */
export interface ShellParams {
  /** The plugin a popout opens on; opened once its pack's frontend adds it, if an external pack's */
  initialPluginId?: string;
  /** Whether this is a main window, which opens on the plugin last open and records the one it opens; a popout does neither */
  ownsLastActivePlugin?: boolean;
}

export interface ShellContext {
  defaultToggles: {
    canvas: boolean;
  };
  activePlugin: Plugin;
  defaultPlugin: Plugin;
  plugins: Plugin[];
  /** Which tabs show, the host's (AppState) */
  pluginVisibility: Record<string, boolean>;
  /** The plugins opened, for back and forward */
  pluginHistory: string[];
  historyIndex: number;
  breadcrumbs: BreadcrumbItem[];
  contextMenuItems: ContextMenuItem[];
  targetView: string;
  panelSizes: ShellPanelSizes;
  hotkeysDisabled: boolean;
  hotkeys: ApplicationHotkeys;
  /** A main window's: it opens on the plugin last open and records the one it opens. A popout's plugin isn't the app's */
  ownsLastActivePlugin: boolean;
  /**
   * A plugin to open that isn't registered yet: the one a popout opens on, or the one last open, when an external
   * pack's frontend adds it after this window starts. Opened when its pack's plugins arrive, unless the user has
   * opened another plugin by then.
   */
  pendingPluginId: string | null;
  /** Plugins asked to open (OPEN_PLUGIN) that aren't registered while pack frontends are still loading */
  pendingOpens: Array<{ plugin: string; events: PluginEvent[] }>;
  /**
   * Each external pack whose frontend load finished, by pack id, with the plugins it added: not those
   * skipped because a plugin had the id already, and none when its frontend exported none or failed to load
   */
  packPluginIds: Record<string, string[]>;
  /** Whether this window's bus subscription is established; it reconnects after the connection drops */
  busSubscribed: boolean;
  /** Whether the pack frontend loader is running: one run at a time, so a pack is never loaded twice */
  packLoadRunning: boolean;
  /** A load was asked for while one was running — the list it read may predate the request — so it runs again */
  packLoadQueued: boolean;
  /**
   * Every pack the loader has finished with, whatever its frontend added — plugins, styles alone, or
   * nothing — so it's never loaded twice. A pack unloaded drops out and loads again when it comes back.
   */
  packFrontendsLoaded: string[];
  /** Packs unloaded while the loader was running: a result that arrives for one of them is dropped */
  packsUnloadedWhileLoading: string[];
  /** Whether the loaded packs were ever read: until it is, a failed read is worth telling the user about */
  loadedPacksRead: boolean;
}

export type ShellEvent =
  | { type: 'SELECT_PLUGIN'; plugin: string; historyIndex?: number }
  | { type: 'OPEN_PLUGIN'; plugin: string; events: PluginEvent[] }
  /** Hands an opened plugin its events, once the shell has selected it */
  | { type: 'DELIVER_PLUGIN_EVENTS'; plugin: string; events: PluginEvent[] }
  | { type: 'DEFAULT_TOGGLE'; area: 'canvas' }
  | { type: 'TRAIL_UPDATE'; crumbs: BreadcrumbItem[]; target?: string; menuItems: ContextMenuItem[] }
  | { type: 'TRAIL_CLICK'; target: string; info?: unknown }
  | { type: 'RESIZE_PANEL'; panel: 'canvas' | 'inspection'; size: number }
  | { type: 'TOGGLE_INSPECTION_PANEL' }
  | { type: 'MAXIMIZE_CHAT' }
  | { type: 'RESTORE_CHAT' }
  | HotkeyEvent
  | { type: 'SWITCH_PLUGIN_UP' }
  | { type: 'SWITCH_PLUGIN_DOWN' }
  | { type: 'NAVIGATE_BACK' }
  | { type: 'NAVIGATE_FORWARD' }
  | { type: 'FORWARD_HOTKEY'; event: HotkeyEvent }
  | { type: 'PROCESS_GLOBAL_HOTKEY'; hotkeyEvent: HotkeyEvent; originalEvent?: { preventDefault(): void } }
  | { type: 'HOTKEYS_RECORDING_START' }
  | { type: 'HOTKEYS_RECORDING_END' }
  // What the host's application system and pack systems send this plugin
  | HostPluginEvents['host/application']
  | { type: 'SET_PLUGIN_VISIBILITY'; plugin: string; visible: boolean }
  | { type: 'CLOSE_DEV_LETTER' }
  | { type: 'SHOW_INSPECTION_PANEL' }
  | { type: 'HIDE_INSPECTION_PANEL' }
  | { type: 'RESET_CHAT_HEIGHT' }
  | { type: 'SYSTEM_ERROR'; errorId?: string; title?: string; message: string; source?: string; operation?: string; entityId?: string; severity?: 'diagnostic' | 'error' | 'fatal'; stack?: string; timestamp?: number }
  | { type: 'BACKEND_ERROR'; error: string | { message: string; stack?: string } }
  | { type: 'BUS_SUBSCRIBED' }
  | { type: 'BUS_CONNECTION_LOST' }
  /** Load the frontends of the external packs this window hasn't loaded: on connecting, and when a pack activates */
  | { type: 'LOAD_PACK_FRONTENDS' }
  /**
   * The loader finished: `loadedPacksError` is why the loaded packs couldn't be read, when they couldn't,
   * and `failedPacks` the packs that threw while loading, which that read reached
   */
  | { type: 'PACK_FRONTENDS_SETTLED'; loadedPacksError?: string; failedPacks?: { packId: string; error: string }[] }
  /**
   * A pack's frontend load finished, with the plugins it exports: none when it failed to load, and null
   * for a pack without frontend code, which is recorded as loaded and asked for nothing
   */
  | { type: 'PACK_FRONTEND_LOADED'; packId: string; plugins: Plugin[] | null }
  | { type: 'PACK_PLUGINS_UNLOADED'; packId: string }
  | { type: 'NOOP' };
