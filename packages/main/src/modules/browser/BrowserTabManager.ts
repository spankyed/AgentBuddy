import {BrowserWindow, WebContentsView, session, type Session} from 'electron';
import type {TabState, TabBounds} from './types.js';

const BROWSER_PARTITION = 'persist:browser';

export class BrowserTabManager {
  readonly #tabs = new Map<number, WebContentsView>();
  #activeTabId: number | null = null;
  #bounds: TabBounds = {x: 0, y: 0, width: 800, height: 600};
  #visible = false;
  #browserSession: Session;
  #mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.#mainWindow = mainWindow;
    this.#browserSession = session.fromPartition(BROWSER_PARTITION);
    this.#configureSession();
  }

  get session(): Session {
    return this.#browserSession;
  }

  #configureSession(): void {
    const ses = this.#browserSession;

    // Strip Electron/app identifiers from user agent
    const defaultUA = ses.getUserAgent();
    const cleanUA = defaultUA
      .replace(/\s*Electron\/[\w.]+/, '')
      .replace(/\s*AgentBuddy\/[\w.]+/, '');
    ses.setUserAgent(cleanUA);

    // Permission request handler
    ses.setPermissionRequestHandler((_webContents, permission, callback) => {
      const allowed = ['notifications', 'clipboard-read', 'clipboard-sanitized-write'];
      if (allowed.includes(permission)) {
        callback(true);
        return;
      }
      // Deny by default (camera, mic, geolocation, etc.)
      callback(false);
    });
  }

  #sendToRenderer(channel: string, ...args: any[]): void {
    if (!this.#mainWindow.isDestroyed()) {
      this.#mainWindow.webContents.send(channel, ...args);
    }
  }

  #getTabState(view: WebContentsView): TabState {
    const wc = view.webContents;
    return {
      id: wc.id,
      url: wc.getURL(),
      title: wc.getTitle() || 'New Tab',
      favicon: '',
      isLoading: wc.isLoading(),
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward(),
    };
  }

  #attachListeners(view: WebContentsView): void {
    const wc = view.webContents;
    const id = wc.id;

    const sendUpdate = (changes: Partial<TabState>) => {
      this.#sendToRenderer('browser:tab-updated', id, changes);
    };

    wc.on('did-start-loading', () => {
      sendUpdate({isLoading: true});
    });

    wc.on('did-stop-loading', () => {
      sendUpdate({isLoading: false});
    });

    const onNavigate = () => {
      sendUpdate({
        url: wc.getURL(),
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward(),
      });
    };

    wc.on('did-navigate', onNavigate);
    wc.on('did-navigate-in-page', onNavigate);

    wc.on('page-title-updated', (_e, title) => {
      sendUpdate({title});
    });

    wc.on('page-favicon-updated', (_e, favicons) => {
      if (favicons.length > 0) {
        sendUpdate({favicon: favicons[0]});
      }
    });

    // Intercept new window/popup requests → create a new tab
    wc.setWindowOpenHandler(({url}) => {
      if (url && url !== 'about:blank') {
        this.createTab(url);
      }
      return {action: 'deny'};
    });
  }

  #applyBounds(view: WebContentsView): void {
    view.setBounds(this.#bounds);
    view.setBorderRadius(8);
  }

  createTab(url?: string): TabState | null {
    if (this.#mainWindow.isDestroyed()) return null;

    const view = new WebContentsView({
      webPreferences: {
        session: this.#browserSession,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
      },
    });

    const id = view.webContents.id;
    this.#tabs.set(id, view);
    this.#attachListeners(view);

    // Add to the main window's content view
    this.#mainWindow.contentView.addChildView(view);

    // Hide initially, then select
    view.setVisible(false);

    // Load URL
    const targetUrl = url || 'about:blank';
    if (targetUrl !== 'about:blank') {
      view.webContents.loadURL(targetUrl).catch(err => {
        console.error(`[Browser] Failed to load URL: ${targetUrl}`, err);
      });
    }

    const tabState = this.#getTabState(view);

    // Select the new tab
    this.selectTab(id);

    this.#sendToRenderer('browser:tab-created', tabState);
    return tabState;
  }

  closeTab(tabId: number): void {
    const view = this.#tabs.get(tabId);
    if (!view) return;

    // Remove from window
    if (!this.#mainWindow.isDestroyed()) {
      this.#mainWindow.contentView.removeChildView(view);
    }

    // Clean up listeners and destroy
    view.webContents.removeAllListeners();
    view.webContents.close();
    this.#tabs.delete(tabId);

    this.#sendToRenderer('browser:tab-removed', tabId);

    // If we closed the active tab, select another
    if (this.#activeTabId === tabId) {
      this.#activeTabId = null;
      const remaining = [...this.#tabs.keys()];
      if (remaining.length > 0) {
        this.selectTab(remaining[remaining.length - 1]);
      }
    }
  }

  selectTab(tabId: number): void {
    // Hide previous active tab
    if (this.#activeTabId !== null && this.#activeTabId !== tabId) {
      const prev = this.#tabs.get(this.#activeTabId);
      if (prev) {
        prev.setVisible(false);
      }
    }

    const view = this.#tabs.get(tabId);
    if (!view) return;

    this.#activeTabId = tabId;
    this.#applyBounds(view);
    view.setVisible(this.#visible);

    this.#sendToRenderer('browser:active-tab-changed', tabId);
  }

  navigate(tabId: number, url: string): void {
    const view = this.#tabs.get(tabId);
    if (!view) return;

    // Normalize URL
    let normalizedUrl = url.trim();
    if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(normalizedUrl)) {
      // No protocol — treat as search or prepend https://
      if (normalizedUrl.includes('.') && !normalizedUrl.includes(' ')) {
        normalizedUrl = `https://${normalizedUrl}`;
      } else {
        normalizedUrl = `https://www.google.com/search?q=${encodeURIComponent(normalizedUrl)}`;
      }
    }

    view.webContents.loadURL(normalizedUrl).catch(err => {
      console.error(`[Browser] Navigation failed: ${normalizedUrl}`, err);
    });
  }

  goBack(tabId: number): void {
    this.#tabs.get(tabId)?.webContents.goBack();
  }

  goForward(tabId: number): void {
    this.#tabs.get(tabId)?.webContents.goForward();
  }

  reload(tabId: number): void {
    this.#tabs.get(tabId)?.webContents.reload();
  }

  stop(tabId: number): void {
    this.#tabs.get(tabId)?.webContents.stop();
  }

  setBounds(bounds: TabBounds): void {
    this.#bounds = bounds;
    if (this.#activeTabId !== null) {
      const view = this.#tabs.get(this.#activeTabId);
      if (view) {
        this.#applyBounds(view);
      }
    }
  }

  show(): void {
    this.#visible = true;
    if (this.#activeTabId !== null) {
      const view = this.#tabs.get(this.#activeTabId);
      if (view) {
        this.#applyBounds(view);
        view.setVisible(true);
      }
    }
  }

  hide(): void {
    this.#visible = false;
    for (const view of this.#tabs.values()) {
      view.setVisible(false);
    }
  }

  getActiveTabId(): number | null {
    return this.#activeTabId;
  }

  getAllTabs(): TabState[] {
    return [...this.#tabs.values()].map(v => this.#getTabState(v));
  }

  destroy(): void {
    for (const [, view] of this.#tabs) {
      if (!this.#mainWindow.isDestroyed()) {
        this.#mainWindow.contentView.removeChildView(view);
      }
      view.webContents.removeAllListeners();
      view.webContents.close();
    }
    this.#tabs.clear();
    this.#activeTabId = null;
  }
}
