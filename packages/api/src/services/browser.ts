/**
 * Browser Automation Service
 * 
 * Simple wrapper service for Playwright browser automation providing
 * a clean interface for common browser automation tasks.
 */

import { chromium, Browser, BrowserContext, Page, ElementHandle, BrowserType } from 'playwright';

export interface LaunchOptions {
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
}

export class BrowserService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private browserType: BrowserType = chromium;

  constructor(browserType: BrowserType = chromium) {
    this.browserType = browserType;
  }

  // Browser lifecycle
  async launch(options: LaunchOptions = {}): Promise<void> {
    this.browser = await this.browserType.launch({
      headless: options.headless ?? true,
    });
    
    this.context = await this.browser.newContext({
      viewport: options.viewport,
    });
    
    this.page = await this.context.newPage();
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  // Get current page instance
  private getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    return this.page;
  }

  // Navigation
  async goto(url: string): Promise<void> {
    const page = this.getPage();
    await page.goto(url);
  }

  async reload(): Promise<void> {
    const page = this.getPage();
    await page.reload();
  }

  async goBack(): Promise<void> {
    const page = this.getPage();
    await page.goBack();
  }

  async goForward(): Promise<void> {
    const page = this.getPage();
    await page.goForward();
  }

  // Element interaction
  async click(selector: string): Promise<void> {
    const page = this.getPage();
    await page.click(selector);
  }

  async type(selector: string, text: string): Promise<void> {
    const page = this.getPage();
    await page.fill(selector, text);
  }

  async press(key: string): Promise<void> {
    const page = this.getPage();
    await page.keyboard.press(key);
  }

  async selectOption(selector: string, value: string | string[]): Promise<void> {
    const page = this.getPage();
    await page.selectOption(selector, value);
  }

  // Element queries
  async getText(selector: string): Promise<string | null> {
    const page = this.getPage();
    return await page.textContent(selector);
  }

  async getAttribute(selector: string, attribute: string): Promise<string | null> {
    const page = this.getPage();
    return await page.getAttribute(selector, attribute);
  }

  async isVisible(selector: string): Promise<boolean> {
    const page = this.getPage();
    return await page.isVisible(selector);
  }

  async isEnabled(selector: string): Promise<boolean> {
    const page = this.getPage();
    return await page.isEnabled(selector);
  }

  // Waiting
  async waitForSelector(selector: string, timeout?: number): Promise<ElementHandle | null> {
    const page = this.getPage();
    return await page.waitForSelector(selector, { timeout });
  }

  async waitForTimeout(timeout: number): Promise<void> {
    const page = this.getPage();
    await page.waitForTimeout(timeout);
  }

  async waitForLoadState(state: 'load' | 'domcontentloaded' | 'networkidle' = 'load'): Promise<void> {
    const page = this.getPage();
    await page.waitForLoadState(state);
  }

  // Screenshots
  async screenshot(path?: string): Promise<Buffer> {
    const page = this.getPage();
    return await page.screenshot({ path });
  }

  // Page info
  async title(): Promise<string> {
    const page = this.getPage();
    return await page.title();
  }

  async url(): Promise<string> {
    const page = this.getPage();
    return page.url();
  }

  // Evaluate JavaScript
  async evaluate<T = any>(fn: () => T): Promise<T> {
    const page = this.getPage();
    return await page.evaluate(fn);
  }

  // Tab management
  async newPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('Browser context not initialized. Call launch() first.');
    }
    const newPage = await this.context.newPage();
    return newPage;
  }

  async switchToPage(targetPage: Page): Promise<void> {
    this.page = targetPage;
  }

  async closePage(targetPage: Page): Promise<void> {
    await targetPage.close();
    // If we closed the current page, switch to first available page
    if (this.page === targetPage && this.context) {
      const pages = this.context.pages();
      this.page = pages.length > 0 ? pages[0] : null;
    }
  }

  // Cookie management
  async setCookies(cookies: Array<{ name: string; value: string; domain?: string; path?: string }>): Promise<void> {
    if (!this.context) {
      throw new Error('Browser context not initialized. Call launch() first.');
    }
    await this.context.addCookies(cookies);
  }

  async getCookies(): Promise<Array<{ name: string; value: string; domain: string; path: string }>> {
    if (!this.context) {
      throw new Error('Browser context not initialized. Call launch() first.');
    }
    return await this.context.cookies();
  }

  async clearCookies(): Promise<void> {
    if (!this.context) {
      throw new Error('Browser context not initialized. Call launch() first.');
    }
    await this.context.clearCookies();
  }

  // Viewport
  async setViewport(width: number, height: number): Promise<void> {
    const page = this.getPage();
    await page.setViewportSize({ width, height });
  }

  // Direct access to playwright objects for advanced usage
  getBrowser(): Browser | null {
    return this.browser;
  }

  getContext(): BrowserContext | null {
    return this.context;
  }

  getCurrentPage(): Page | null {
    return this.page;
  }
}

// Factory function for creating browser instances
export function createBrowser(browserType?: BrowserType): BrowserService {
  return new BrowserService(browserType);
}

// Re-export browser types from playwright for convenience
export { chromium, firefox, webkit } from 'playwright';
export type { Browser, BrowserContext, Page } from 'playwright';