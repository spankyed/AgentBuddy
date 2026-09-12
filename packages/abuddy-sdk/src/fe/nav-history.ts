export interface NavHistory<T> {
  stack: T[];
  index: number;
}

const MAX_STACK_SIZE = 50;

export function createNavHistory<T>(initial: T): NavHistory<T> {
  return { stack: [initial], index: 0 };
}

export function pushNavHistory<T>(history: NavHistory<T>, entry: T): NavHistory<T> {
  if (history.index >= 0 && history.stack[history.index] === entry) return history;

  const stack = [...history.stack.slice(0, history.index + 1), entry];
  if (stack.length > MAX_STACK_SIZE) stack.shift();
  return { stack, index: stack.length - 1 };
}

export function canGoBack<T>(history: NavHistory<T>): boolean {
  return history.index > 0;
}

export function canGoForward<T>(history: NavHistory<T>): boolean {
  return history.index < history.stack.length - 1;
}

export function goBack<T>(history: NavHistory<T>): { history: NavHistory<T>; entry: T } | null {
  if (!canGoBack(history)) return null;
  const newIndex = history.index - 1;
  return { history: { ...history, index: newIndex }, entry: history.stack[newIndex] };
}

export function goForward<T>(history: NavHistory<T>): { history: NavHistory<T>; entry: T } | null {
  if (!canGoForward(history)) return null;
  const newIndex = history.index + 1;
  return { history: { ...history, index: newIndex }, entry: history.stack[newIndex] };
}
