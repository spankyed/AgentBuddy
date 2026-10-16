import { createApp, h, nextTick, reactive, type App } from 'vue';
import QuestionInput from '../../../src/extensions/blocks/input/QuestionInput.vue';

let app: App | undefined;
afterEach(() => { app?.unmount(); document.body.replaceChildren(); });

it('removes a retired question form even when its adapter supplies no answer', async () => {
  const state = reactive<{ disabled: boolean; response: unknown }>({ disabled: false, response: null });
  const submit = vi.fn();
  const root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => h(QuestionInput, { questions: [{ question: 'Which fixture?', options: [{ id: 'Alpha', label: 'Alpha' }] }], ...state, onSubmit: submit }) });
  app.mount(root);
  const oldChoice = Array.from(root.querySelectorAll('div')).find(element => element.textContent === 'Alpha')!;
  expect(root.querySelector('textarea')).not.toBeNull();
  expect(root.querySelector('button')).not.toBeNull();
  state.disabled = true;
  await nextTick();
  expect(root.textContent).toContain('Question closed');
  expect(root.querySelector('textarea')).toBeNull();
  expect(root.querySelector('button')).toBeNull();
  oldChoice.click();
  expect(submit).not.toHaveBeenCalled();
});

it.each([{ cancelled: true }, 'Alpha'])('renders a retired response without input controls (%j)', response => {
  const root = document.createElement('div'); document.body.append(root);
  app = createApp(QuestionInput, { questions: [{ question: 'Which fixture?', options: [] }], disabled: true, response });
  app.mount(root);
  expect(root.textContent).toContain(typeof response === 'string' ? 'Answered' : 'Cancelled');
  expect(root.querySelector('button')).toBeNull();
  expect(root.querySelector('textarea')).toBeNull();
});

function questionFixture(firstMultiSelect = false) {
  const submit = vi.fn();
  const root = document.createElement('div'); document.body.append(root);
  app = createApp(QuestionInput, { questions: [
    { question: 'First fixture?', options: [{ id: 'Alpha', label: 'Alpha' }, { id: 'Beta', label: 'Beta' }], multiSelect: firstMultiSelect },
    { question: 'Second fixture?', options: [{ id: 'Gamma', label: 'Gamma' }] },
  ], onSubmit: submit });
  app.mount(root);
  const click = async (text: string) => {
    const element = Array.from(root.querySelectorAll<HTMLElement>('button, div')).filter(value => value.textContent === text).at(-1)!;
    element.click(); await nextTick();
  };
  return { root, submit, click };
}

it('restores a custom answer visibly when navigating back', async () => {
  const { root, click, submit } = questionFixture();
  const input = root.querySelector('textarea')!;
  input.value = 'Custom fixture answer'; input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick(); await click('Next'); await click('Back');
  expect(root.querySelector('textarea')!.value).toBe('Custom fixture answer');
  await click('Next'); await click('Gamma'); await click('Submit');
  expect(submit).toHaveBeenCalledOnce();
  expect(submit).toHaveBeenCalledWith({ 'First fixture?': 'Custom fixture answer', 'Second fixture?': 'Gamma' });
});

it('restores individual multi-select choices so deselection does not corrupt the answer', async () => {
  const { click, submit } = questionFixture(true);
  await click('Alpha'); await click('Beta'); await click('Next'); await click('Back');
  await click('Alpha'); await click('Next'); await click('Gamma'); await click('Submit');
  expect(submit).toHaveBeenCalledOnce();
  expect(submit).toHaveBeenCalledWith({ 'First fixture?': 'Beta', 'Second fixture?': 'Gamma' });
});

it('preserves an unfinished later-step draft across backward and forward navigation', async () => {
  const { root, click, submit } = questionFixture();
  await click('Alpha'); await click('Next');
  const input = root.querySelector('textarea')!;
  input.value = 'Later custom draft'; input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick(); await click('Back'); await click('Next');
  expect(root.querySelector('textarea')!.value).toBe('Later custom draft');
  await click('Submit');
  expect(submit).toHaveBeenCalledWith({ 'First fixture?': 'Alpha', 'Second fixture?': 'Later custom draft' });
});

it('rejects a detached submit control after the question is retired', async () => {
  const state = reactive({ disabled: false });
  const submit = vi.fn();
  const root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => h(QuestionInput, {
    questions: [{ question: 'Retired custom answer?', options: [] }], disabled: state.disabled, onSubmit: submit,
  }) });
  app.mount(root);
  const input = root.querySelector('textarea')!;
  input.value = 'Answer typed before retirement'; input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  const button = Array.from(root.querySelectorAll('button')).find(value => value.textContent === 'Submit')!;
  state.disabled = true; await nextTick();
  button.click();
  expect(submit).not.toHaveBeenCalled();
});
