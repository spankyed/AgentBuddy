import {BrowserWindow, WebContentsView, session, type Session} from 'electron';
import {BrowserPasskeyManager, type PasskeyInfo} from './BrowserPasskeyManager.js';
import type {TabState, TabBounds} from './types.js';

const BROWSER_PARTITION = 'persist:browser';

function errorPageHtml(url: string, description: string): string {
  const safeUrl = url.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const safeDesc = description.replace(/</g, '&lt;');
  return `<html><head><style>
    body { background: #0a0a0a; color: #a3a3a3; font-family: -apple-system, system-ui, sans-serif;
           display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .error { text-align: center; max-width: 420px; }
    h2 { color: #e5e5e5; font-size: 18px; margin-bottom: 8px; }
    p { font-size: 14px; line-height: 1.6; }
    code { background: #262626; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  </style></head><body><div class="error">
    <h2>This page can\u2019t be reached</h2>
    <p><code>${safeUrl}</code></p>
    <p>${safeDesc}</p>
  </div></body></html>`;
}

export class BrowserTabManager {
  readonly #tabs = new Map<number, WebContentsView>();
  readonly #pendingUrls = new Map<number, string>(); // lazy tabs: tabId → URL to load on demand
  readonly #favicons = new Map<number, string>(); // tabId → last known favicon URL
  readonly #persistedIds = new Map<number, string>(); // tabId → stable app-level tab ID
  #activeTabId: number | null = null;
  #bounds: TabBounds = {x: 0, y: 0, width: 800, height: 600};
  #visible = false;
  #browserSession: Session;
  #mainWindow: BrowserWindow;
  #passkeys: BrowserPasskeyManager;

  constructor(mainWindow: BrowserWindow) {
    this.#mainWindow = mainWindow;
    this.#browserSession = session.fromPartition(BROWSER_PARTITION);
    this.#configureSession();
    this.#passkeys = new BrowserPasskeyManager(event => {
      this.#sendToRenderer('browser:passkey-event', event);
    });
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
      callback(false);
    });

    // Download handler — Electron prompts the user for save location by default
    ses.on('will-download', (_event, item) => {
      const fileName = item.getFilename();
      item.once('done', (_e, state) => {
        console.log(`[Browser] Download ${state === 'completed' ? 'complete' : state}: ${fileName}`);
      });
    });
  }

  #sendToRenderer(channel: string, ...args: any[]): void {
    if (!this.#mainWindow.isDestroyed()) {
      this.#mainWindow.webContents.send(channel, ...args);
    }
  }

  #getTabState(view: WebContentsView): TabState {
    const wc = view.webContents;
    const id = wc.id;
    return {
      id,
      persistedId: this.#persistedIds.get(id),
      url: wc.getURL() || this.#pendingUrls.get(id) || '',
      title: wc.getTitle() || 'New Tab',
      favicon: this.#favicons.get(id) || '',
      isLoading: wc.isLoading(),
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward(),
      isMuted: wc.isAudioMuted(),
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
        this.#favicons.set(id, favicons[0]);
        sendUpdate({favicon: favicons[0]});
      }
    });

    // Show friendly error page on navigation failure
    wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      // -3 = aborted (user navigated away or stopped loading)
      if (errorCode === -3) return;

      const html = errorPageHtml(validatedURL, errorDescription || `ERR_${Math.abs(errorCode)}`);
      wc.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => {});
    });

    // Browser keyboard shortcuts (Cmd/Ctrl+W/T/R/L)
    // Must be handled here because the WebContentsView captures keyboard
    // focus — events never reach the renderer's window listener.
    wc.on('before-input-event', (event, input) => {
      if (!input.meta && !input.control) return;
      if (input.type !== 'keyDown') return;

      switch (input.key) {
        case 'w':
          event.preventDefault();
          this.closeTab(id);
          break;
        case 't':
          event.preventDefault();
          this.createTab();
          break;
        case 'r':
          event.preventDefault();
          this.reload(id);
          break;
        case 'l':
          event.preventDefault();
          this.#sendToRenderer('browser:focus-address-bar');
          break;
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
  }

  createTab(url?: string, options?: { lazy?: boolean; title?: string; favicon?: string; activate?: boolean; persistedId?: string }): TabState | null {
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
    if (options?.persistedId) {
      this.#persistedIds.set(id, options.persistedId);
    }
    this.#attachListeners(view);
    this.#passkeys.attach(view.webContents);

    // Add to the main window's content view
    this.#mainWindow.contentView.addChildView(view);

    // Hide initially, then select
    view.setVisible(false);

    // Load URL (or defer if lazy)
    const targetUrl = url || 'about:blank';
    if (targetUrl !== 'about:blank') {
      if (options?.lazy) {
        this.#pendingUrls.set(id, targetUrl);
      } else {
        view.webContents.loadURL(targetUrl).catch(err => {
          console.error(`[Browser] Failed to load URL: ${targetUrl}`, err);
        });
      }
    }

    // Build tab state — for lazy tabs, use provided metadata since the page hasn't loaded
    if (options?.favicon) {
      this.#favicons.set(id, options.favicon);
    }
    const tabState: TabState = options?.lazy
      ? {
        id,
        persistedId: options.persistedId,
        url: targetUrl,
        title: options.title || 'New Tab',
        favicon: options.favicon || '',
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        isMuted: false,
      }
      : this.#getTabState(view);

    // Send tab-created BEFORE selectTab so the renderer has the tab in its
    // array when active-tab-changed arrives (otherwise address bar won't sync).
    this.#sendToRenderer('browser:tab-created', tabState);
    if (options?.activate !== false) {
      this.selectTab(id);
    }

    // Auto-focus address bar for blank new tabs
    if (targetUrl === 'about:blank') {
      this.#sendToRenderer('browser:focus-address-bar');
    }

    return tabState;
  }

  loadTab(tabId: number): void {
    const url = this.#pendingUrls.get(tabId);
    if (!url) return;
    const view = this.#tabs.get(tabId);
    if (!view) return;
    this.#pendingUrls.delete(tabId);
    view.webContents.loadURL(url).catch(err => {
      console.error(`[Browser] Failed to load URL: ${url}`, err);
    });
  }

  closeTab(tabId: number): void {
    const view = this.#tabs.get(tabId);
    if (!view) return;

    // Remove from window
    if (!this.#mainWindow.isDestroyed()) {
      this.#mainWindow.contentView.removeChildView(view);
    }

    // Clean up listeners and destroy
    this.#passkeys.detach(tabId);
    view.webContents.removeAllListeners();
    view.webContents.close();
    this.#tabs.delete(tabId);
    this.#pendingUrls.delete(tabId);
    this.#favicons.delete(tabId);
    this.#persistedIds.delete(tabId);

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

    // Auto-load lazy tabs when selected (only if browser overlay is visible)
    if (this.#visible) {
      this.loadTab(tabId);
    }

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

  duplicateTab(tabId: number): TabState | null {
    const view = this.#tabs.get(tabId);
    if (!view) return null;
    const url = view.webContents.getURL();
    return this.createTab(url && url !== 'about:blank' ? url : undefined);
  }

  setTabMuted(tabId: number, muted: boolean): void {
    const view = this.#tabs.get(tabId);
    if (!view) return;
    view.webContents.setAudioMuted(muted);
    this.#sendToRenderer('browser:tab-updated', tabId, { isMuted: muted });
  }

  toggleDevTools(tabId: number): void {
    const wc = this.#tabs.get(tabId)?.webContents;
    if (!wc) return;
    if (wc.isDevToolsOpened()) {
      wc.closeDevTools();
    } else {
      wc.openDevTools({ mode: 'detach' });
    }
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

  getPasskeys(): PasskeyInfo[] {
    return this.#passkeys.list();
  }

  deletePasskey(credentialId: string): Promise<boolean> {
    return this.#passkeys.delete(credentialId);
  }

  getAllTabs(): TabState[] {
    return [...this.#tabs.values()].map(v => this.#getTabState(v));
  }

  destroy(): void {
    for (const [id, view] of this.#tabs) {
      if (!this.#mainWindow.isDestroyed()) {
        this.#mainWindow.contentView.removeChildView(view);
      }
      this.#passkeys.detach(id);
      view.webContents.removeAllListeners();
      view.webContents.close();
    }
    this.#tabs.clear();
    this.#persistedIds.clear();
    this.#activeTabId = null;
  }
}
