import {productIntroFixture} from './fixtures/product-intro';
import type {DemoConfig, DemoFixture} from './types';

const fixtures: Record<string, DemoFixture> = {
  'product-intro': productIntroFixture,
};

export function getDemoFixture(config: DemoConfig): DemoFixture {
  const fixture = fixtures[config.id];
  if (!fixture) {
    throw new Error(`Unknown demo fixture: ${config.id}`);
  }

  if (!fixture.scenes[config.scene]) {
    throw new Error(`Unknown demo scene "${config.scene}" for fixture "${config.id}".`);
  }

  return fixture;
}

export function disableDemoAnimationVariance() {
  const style = document.createElement('style');
  style.dataset.demoDeterministic = 'true';
  style.textContent = `
    *, *::before, *::after {
      animation-duration: 1ms !important;
      animation-delay: 0ms !important;
      transition-duration: 1ms !important;
      transition-delay: 0ms !important;
      scroll-behavior: auto !important;
    }
  `;
  document.head.appendChild(style);
}
