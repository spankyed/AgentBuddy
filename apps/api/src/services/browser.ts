/**
 * Browser Automation Service
 * 
 * Wrapper service for Taiko browser automation library providing
 * a clean interface for browser automation tasks including navigation,
 * element interaction, and data extraction.
 */

import * as taiko from 'taiko';
import type { BrowserOptions, ScreenshotOptions, Cookie, NavigationOptions } from 'taiko';

// Re-export useful types
export type { Cookie, ScreenshotOptions } from 'taiko';

export interface LaunchOptions extends BrowserOptions {
  headless?: boolean;
  args?: string[];
  defaultViewport?: {
    width: number;
    height: number;
  };
}

export interface WaitOptions {
  timeout?: number;
  waitForEvents?: string[];
  navigationTimeout?: number;
}

export interface InterceptOptions {
  continueRequest?: () => void;
  responseBody?: string | object;
  responseCode?: number;
}

// Browser lifecycle management
export async function launch(options: LaunchOptions = {}) {
  const { defaultViewport, ...browserOptions } = options;
  
  await taiko.openBrowser(browserOptions);
  
  if (defaultViewport) {
    await taiko.setViewPort(defaultViewport);
  }
}

export async function close() {
  await taiko.closeBrowser();
}

// Navigation
export async function navigateTo(url: string, options?: NavigationOptions) {
  await taiko.goto(url, options);
}

export async function reload(url?: string, options?: NavigationOptions) {
  await taiko.reload(url, options as any);
}

export async function goBack(options?: NavigationOptions) {
  await taiko.goBack(options);
}

export async function goForward(options?: NavigationOptions) {
  await taiko.goForward(options);
}

// Element interaction
export async function click(selector: string | taiko.SearchElement) {
  await taiko.click(selector);
}

export async function doubleClick(selector: string | taiko.SearchElement) {
  await taiko.doubleClick(selector);
}

export async function rightClick(selector: string | taiko.SearchElement) {
  await taiko.rightClick(selector);
}

export async function hover(selector: string | taiko.SearchElement) {
  await taiko.hover(selector);
}

export async function focus(selector: string | taiko.SearchElement) {
  await taiko.focus(selector);
}

export async function type(text: string, into?: string | taiko.SearchElement) {
  if (into) {
    await taiko.write(text, taiko.into(into));
  } else {
    await taiko.write(text);
  }
}

export async function clear(selector: string | taiko.SearchElement) {
  await taiko.clear(selector);
}

export async function press(key: string) {
  await taiko.press(key);
}

export async function attach(filepath: string, to: string | taiko.SearchElement) {
  await taiko.attach(filepath, taiko.to(to as string));
}

export async function select(value: string | string[], from: string | taiko.SearchElement) {
  if (Array.isArray(value)) {
    for (const v of value) {
      await taiko.checkBox(v, taiko.near(from)).check();
    }
  } else {
    await taiko.dropDown(from as any).select(value);
  }
}

// Element state
export async function exists(selector: string | taiko.SearchElement): Promise<boolean> {
  try {
    const element = await taiko.$(selector as any);
    return await element.exists();
  } catch {
    return false;
  }
}

export async function isVisible(selector: string | taiko.SearchElement): Promise<boolean> {
  try {
    const element = await taiko.$(selector as any);
    return await element.isVisible();
  } catch {
    return false;
  }
}

export async function isDisabled(selector: string | taiko.SearchElement): Promise<boolean> {
  try {
    const element = await taiko.$(selector as any);
    return await element.isDisabled();
  } catch {
    return false;
  }
}

// Data extraction
export async function getText(selector?: string | taiko.SearchElement): Promise<string> {
  if (selector) {
    return await taiko.text(selector as string).text();
  }
  // Get all text on the page
  const allText = await taiko.evaluate(() => document.body.innerText);
  return allText as string;
}

export async function getAttribute(selector: string | taiko.SearchElement, attribute: string): Promise<string | null> {
  try {
    const element = await taiko.$(selector as any);
    return await element.attribute(attribute);
  } catch {
    return null;
  }
}

export async function getTitle(): Promise<string> {
  return await taiko.title();
}

export async function getUrl(): Promise<string> {
  return await taiko.currentURL();
}

export async function screenshot(options?: ScreenshotOptions): Promise<Buffer> {
  const result = await taiko.screenshot(options);
  if (!result) {
    throw new Error('Screenshot failed');
  }
  return result;
}

// Waiting
export async function waitFor(
  condition: string | taiko.SearchElement | number | (() => Promise<boolean>),
  options: WaitOptions = {}
) {
  if (typeof condition === 'number') {
    await taiko.waitFor(condition);
  } else if (typeof condition === 'function') {
    await taiko.waitFor(condition, options.timeout);
  } else {
    await taiko.waitFor(condition as any, options.timeout);
  }
}

export async function waitForNavigation(options?: NavigationOptions) {
  // waitForNavigation is deprecated in newer versions, using goto with waitForNavigation option instead
  // This is a no-op but kept for API compatibility
  await new Promise(resolve => setTimeout(resolve, 100));
}

export async function waitForElement(selector: string | taiko.SearchElement, timeout?: number) {
  await taiko.waitFor(selector, timeout);
}

// Advanced features
export async function intercept(
  requestUrl: string | RegExp,
  handler?: (request: any) => InterceptOptions | void
) {
  if (handler) {
    await taiko.intercept(requestUrl as string, (request) => {
      const options = handler(request);
      if (options) {
        if (options.continueRequest) {
          options.continueRequest();
        } else if (options.responseBody !== undefined) {
          request.respond({
            body: typeof options.responseBody === 'string' 
              ? options.responseBody 
              : JSON.stringify(options.responseBody),
            statusCode: options.responseCode || 200,
          });
        }
      }
    });
  } else {
    await taiko.intercept(requestUrl as string);
  }
}

export async function emulateDevice(device: string) {
  await taiko.emulateDevice(device);
}

export async function setViewport(size: { width: number; height: number }) {
  await taiko.setViewPort(size);
}

export async function setCookie(cookies: Cookie | Cookie[]) {
  const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
  for (const cookie of cookieArray) {
    const options: any = {};
    if (cookie.domain) options.domain = cookie.domain;
    if (cookie.path) options.path = cookie.path;
    if (cookie.secure !== undefined) options.secure = cookie.secure;
    if (cookie.httpOnly !== undefined) options.httpOnly = cookie.httpOnly;
    if (cookie.sameSite) options.sameSite = cookie.sameSite;
    if (cookie.expires) options.expires = cookie.expires;
    
    await taiko.setCookie(cookie.name, cookie.value, options);
  }
}

export async function getCookies(): Promise<Cookie[]> {
  return await taiko.getCookies();
}

export async function deleteCookies(cookieName?: string) {
  if (cookieName) {
    await taiko.deleteCookies(cookieName);
  } else {
    await taiko.deleteCookies();
  }
}

// Tab management
export async function openTab(url?: string): Promise<void> {
  if (url) {
    await taiko.openTab(url);
  } else {
    await taiko.openTab();
  }
}

export async function closeTab(url?: string): Promise<void> {
  if (url) {
    await taiko.closeTab(url);
  } else {
    await taiko.closeTab();
  }
}

export async function switchTo(target: string | RegExp): Promise<void> {
  await taiko.switchTo(target as any);
}

// Utility functions
export async function evaluate<T = any>(
  fn: string | ((...args: any[]) => T),
  ...args: any[]
): Promise<T> {
  return await taiko.evaluate(fn, ...args);
}

export async function scrollTo(selector: string | taiko.SearchElement) {
  await taiko.scrollTo(selector);
}

export async function scrollDown(pixels?: number) {
  await taiko.scrollDown(pixels);
}

export async function scrollUp(pixels?: number) {
  await taiko.scrollUp(pixels);
}

export async function scrollRight(pixels?: number) {
  await taiko.scrollRight(pixels);
}

export async function scrollLeft(pixels?: number) {
  await taiko.scrollLeft(pixels);
}

// Proximity selectors
export const near = taiko.near;
export const toLeftOf = taiko.toLeftOf;
export const toRightOf = taiko.toRightOf;
export const above = taiko.above;
export const below = taiko.below;
export const link = taiko.link;
export const button = taiko.button;
export const textBox = taiko.textBox;
export const dropDown = taiko.dropDown;
export const checkBox = taiko.checkBox;
export const radioButton = taiko.radioButton;
export const text = taiko.text;
export const image = taiko.image;

// Client access for advanced usage
export function getClient() {
  return taiko.client();
}