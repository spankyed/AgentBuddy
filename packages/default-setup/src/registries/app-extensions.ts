import type { Component } from 'vue';
import Welcome from '../extensions/Welcome.vue';

export const appExtensions: Record<string, Component> = {
  welcome: Welcome,
};
