export function pasteIntoElement(el: HTMLElement, text: string): void {
  const event = new CustomEvent('abuddy:paste', { detail: { text }, bubbles: true, cancelable: true });
  const handled = !el.dispatchEvent(event);
  if (handled) return;
  el.focus();
  document.execCommand('insertText', false, text + ' ');
}
