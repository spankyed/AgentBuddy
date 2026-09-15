import type { EARS } from '@/__generated__/ears';

export type BrowserTabId = `${EARS.Entity.BrowserTab}-${string}`;

export interface BrowserTabEntity {
  id: BrowserTabId;
  entityType: EARS.Entity.BrowserTab;
  url: string;
  title: string;
  favicon: string;
  displayOrder: number;
  isMuted: boolean;
  groupId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SavedTab {
  id: BrowserTabId;
  url: string;
  title: string;
  favicon: string;
  displayOrder: number;
  isMuted: boolean;
  groupId?: string;
}

export interface BrowserBookmarkEntity {
  id: EARS.EntityId;
  entityType: EARS.Entity.BrowserBookmark;
  url: string;
  title: string;
  favicon: string;
  displayOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface SavedBookmark {
  url: string;
  title: string;
  favicon: string;
  displayOrder: number;
}

// ─── Browser automation service (`services.browser`) ─────────────────────────
// Playwright stays inside the service: the contract names no playwright types.

export type BrowserEngine = 'chromium' | 'firefox' | 'webkit';

export interface BrowserLaunchOptions {
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
}

export interface BrowserCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
}

declare const browserPageBrand: unique symbol;

/** A page opened by `newPage()`, passed back to `switchToPage`/`closePage` */
export interface BrowserPageHandle {
  readonly [browserPageBrand]: true;
}

/** One automated browser: launch it, drive its current page, close it */
export interface BrowserSession {
  launch(options?: BrowserLaunchOptions): Promise<void>;
  close(): Promise<void>;

  goto(url: string): Promise<void>;
  reload(): Promise<void>;
  goBack(): Promise<void>;
  goForward(): Promise<void>;

  click(selector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  press(key: string): Promise<void>;
  selectOption(selector: string, value: string | string[]): Promise<void>;

  getText(selector: string): Promise<string | null>;
  getAttribute(selector: string, attribute: string): Promise<string | null>;
  isVisible(selector: string): Promise<boolean>;
  isEnabled(selector: string): Promise<boolean>;

  /** Resolves the raw playwright `ElementHandle`, or null */
  waitForSelector(selector: string, timeout?: number): Promise<unknown>;
  waitForTimeout(timeout: number): Promise<void>;
  waitForLoadState(state?: 'load' | 'domcontentloaded' | 'networkidle'): Promise<void>;

  screenshot(path?: string): Promise<Buffer>;
  title(): Promise<string>;
  url(): Promise<string>;
  evaluate<T>(fn: () => T): Promise<T>;

  newPage(): Promise<BrowserPageHandle>;
  switchToPage(page: BrowserPageHandle): Promise<void>;
  closePage(page: BrowserPageHandle): Promise<void>;

  setCookies(cookies: Array<{ name: string; value: string; domain?: string; path?: string }>): Promise<void>;
  getCookies(): Promise<BrowserCookie[]>;
  clearCookies(): Promise<void>;

  setViewport(width: number, height: number): Promise<void>;

  /** The raw playwright `Browser`, `BrowserContext` and current `Page`, for advanced use */
  getBrowser(): unknown;
  getContext(): unknown;
  getCurrentPage(): unknown;
}

export interface BrowserService {
  createBrowser(engine?: BrowserEngine): BrowserSession;
}
