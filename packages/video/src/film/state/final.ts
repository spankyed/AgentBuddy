import {ease, mix} from './timeline';

export const finalShotState = {
  breadcrumbs: ['AgentBuddy'],
  titleBar: 'Launch Film',
  brand: 'AgentBuddy',
  tagline: 'The AI operating system for modern work.',
  motion: {
    title: {from: 24, to: 70, yFrom: 20, yTo: 0},
    tagline: {from: 52, to: 94},
  },
};

export function finalViewForFrame(frame: number) {
  const titleProgress = ease(frame, finalShotState.motion.title.from, finalShotState.motion.title.to);
  return {
    titleStyle: {
      opacity: titleProgress,
      transform: `translateY(${mix(finalShotState.motion.title.yFrom, finalShotState.motion.title.yTo, titleProgress)}px)`,
    },
    taglineStyle: {
      opacity: ease(frame, finalShotState.motion.tagline.from, finalShotState.motion.tagline.to),
    },
  };
}
