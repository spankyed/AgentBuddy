/**
 * Browser Automation Service
 * 
 * Simple wrapper service for Playwright browser automation providing
 * a clean interface for common browser automation tasks.
 */

import { chromium, Browser, BrowserContext, Page, ElementHandle } from 'playwright';

// Browser instance management
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

export interface LaunchOptions {
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
}

// Browser lifecycle
export async function launch(options: LaunchOptions = {}): Promise<void> {
  browser = await chromium.launch({
    headless: options.headless ?? true,
  });
  
  context = await browser.newContext({
    viewport: options.viewport,
  });
  
  page = await context.newPage();
}

export async function close(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
    context = null;
    page = null;
  }
}

// Get current page instance
export function getPage(): Page {
  if (!page) {
    throw new Error('Browser not launched. Call launch() first.');
  }
  return page;
}

// Navigation
export async function goto(url: string): Promise<void> {
  const currentPage = getPage();
  await currentPage.goto(url);
}

export async function reload(): Promise<void> {
  const currentPage = getPage();
  await currentPage.reload();
}

export async function goBack(): Promise<void> {
  const currentPage = getPage();
  await currentPage.goBack();
}

export async function goForward(): Promise<void> {
  const currentPage = getPage();
  await currentPage.goForward();
}

// Element interaction
export async function click(selector: string): Promise<void> {
  const currentPage = getPage();
  await currentPage.click(selector);
}

export async function type(selector: string, text: string): Promise<void> {
  const currentPage = getPage();
  await currentPage.fill(selector, text);
}

export async function press(key: string): Promise<void> {
  const currentPage = getPage();
  await currentPage.keyboard.press(key);
}

export async function selectOption(selector: string, value: string | string[]): Promise<void> {
  const currentPage = getPage();
  await currentPage.selectOption(selector, value);
}

// Element queries
export async function getText(selector: string): Promise<string | null> {
  const currentPage = getPage();
  return await currentPage.textContent(selector);
}

export async function getAttribute(selector: string, attribute: string): Promise<string | null> {
  const currentPage = getPage();
  return await currentPage.getAttribute(selector, attribute);
}

export async function isVisible(selector: string): Promise<boolean> {
  const currentPage = getPage();
  return await currentPage.isVisible(selector);
}

export async function isEnabled(selector: string): Promise<boolean> {
  const currentPage = getPage();
  return await currentPage.isEnabled(selector);
}

// Waiting
export async function waitForSelector(selector: string, timeout?: number): Promise<ElementHandle<Element> | null> {
  const currentPage = getPage();
  return await currentPage.waitForSelector(selector, { timeout });
}

export async function waitForTimeout(timeout: number): Promise<void> {
  const currentPage = getPage();
  await currentPage.waitForTimeout(timeout);
}

export async function waitForLoadState(state: 'load' | 'domcontentloaded' | 'networkidle' = 'load'): Promise<void> {
  const currentPage = getPage();
  await currentPage.waitForLoadState(state);
}

// Screenshots
export async function screenshot(path?: string): Promise<Buffer> {
  const currentPage = getPage();
  return await currentPage.screenshot({ path });
}

// Page info
export async function title(): Promise<string> {
  const currentPage = getPage();
  return await currentPage.title();
}

export async function url(): Promise<string> {
  const currentPage = getPage();
  return currentPage.url();
}

// Evaluate JavaScript
export async function evaluate<T = any>(fn: () => T): Promise<T> {
  const currentPage = getPage();
  return await currentPage.evaluate(fn);
}

// Tab management
export async function newPage(): Promise<Page> {
  if (!context) {
    throw new Error('Browser context not initialized. Call launch() first.');
  }
  const newPage = await context.newPage();
  return newPage;
}

export async function switchToPage(targetPage: Page): Promise<void> {
  page = targetPage;
}

export async function closePage(targetPage: Page): Promise<void> {
  await targetPage.close();
  // If we closed the current page, switch to first available page
  if (page === targetPage && context) {
    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : null;
  }
}

// Cookie management
export async function setCookies(cookies: Array<{ name: string; value: string; domain?: string; path?: string }>): Promise<void> {
  if (!context) {
    throw new Error('Browser context not initialized. Call launch() first.');
  }
  await context.addCookies(cookies);
}

export async function getCookies(): Promise<Array<{ name: string; value: string; domain: string; path: string }>> {
  if (!context) {
    throw new Error('Browser context not initialized. Call launch() first.');
  }
  return await context.cookies();
}

export async function clearCookies(): Promise<void> {
  if (!context) {
    throw new Error('Browser context not initialized. Call launch() first.');
  }
  await context.clearCookies();
}

// Viewport
export async function setViewport(width: number, height: number): Promise<void> {
  const currentPage = getPage();
  await currentPage.setViewportSize({ width, height });
}

// Direct access to playwright objects for advanced usage
export function getBrowser(): Browser | null {
  return browser;
}

export function getContext(): BrowserContext | null {
  return context;
}