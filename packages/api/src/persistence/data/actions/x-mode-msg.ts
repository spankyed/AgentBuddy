// @ts-nocheck
import Services from '@/services';

/**
 */
export async function routeModeMessage(params: any, services: typeof Services) {
  let { text, threadId, sender = 'user' } = params.message;


  return {
    ...result,
    success: true
  };
}