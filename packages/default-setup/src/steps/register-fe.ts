import { stepRegistry } from '@abuddy/sdk/steps';
import SwitchNode from './switch/node.vue';
import ActionForm from './action/form.vue';
import LLMForm from './llm/form.vue';
import SwitchForm from './switch/form.vue';
import FireForm from './fire/form.vue';
import FlowForm from './flow/form.vue';
import CreateForm from './create/form.vue';
import ScheduleForm from './schedule/form.vue';

export function registerStepComponents(): void {
  stepRegistry.setComponents('switch', { node: SwitchNode, form: SwitchForm });
  stepRegistry.setComponents('action', { form: ActionForm });
  stepRegistry.setComponents('llm', { form: LLMForm });
  stepRegistry.setComponents('fire', { form: FireForm });
  stepRegistry.setComponents('flow', { form: FlowForm });
  stepRegistry.setComponents('create', { form: CreateForm });
  stepRegistry.setComponents('schedule', { form: ScheduleForm });
}
