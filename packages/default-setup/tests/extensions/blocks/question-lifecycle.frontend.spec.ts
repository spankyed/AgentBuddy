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
