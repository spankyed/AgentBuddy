import type ToastNotification from '@/core/components/design/ToastNotification.vue';

type ToastApi = InstanceType<typeof ToastNotification>;
type QueuedToast = {
  type: 'success' | 'error' | 'info';
  message: string;
  description?: string;
};

let toast: ToastApi | null = null;
const queue: QueuedToast[] = [];

export function registerGlobalToast(instance: ToastApi | null) {
  toast = instance;
  if (!toast) return;

  for (const item of queue.splice(0)) {
    toast[item.type](item.message, item.description);
  }
}

export const globalToast = {
  success(message: string, description?: string) {
    show({ type: 'success', message, description });
  },
  error(message: string, description?: string) {
    show({ type: 'error', message, description });
  },
  info(message: string, description?: string) {
    show({ type: 'info', message, description });
  },
};

function show(item: QueuedToast) {
  if (toast) {
    toast[item.type](item.message, item.description);
    return;
  }
  queue.push(item);
}
