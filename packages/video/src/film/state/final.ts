import {ease, mix} from './timeline';

export type FinalShotView = {
  date: string;
  link: string;
  linkStyle: {
    opacity: number;
    transform: string;
  };
  dateStyle: {
    opacity: number;
  };
};

export const finalShotState = {
  date: 'june 19th',
  link: 'clientlabs.com',
  motion: {
    link: {from: 24, to: 70, yFrom: 20, yTo: 0},
    date: {from: 58, to: 96},
  },
};

export function finalViewForFrame(frame: number) {
  const linkProgress = ease(frame, finalShotState.motion.link.from, finalShotState.motion.link.to);
  return {
    linkStyle: {
      opacity: linkProgress,
      transform: `translateY(${mix(finalShotState.motion.link.yFrom, finalShotState.motion.link.yTo, linkProgress)}px)`,
    },
    dateStyle: {
      opacity: ease(frame, finalShotState.motion.date.from, finalShotState.motion.date.to),
    },
  };
}

export function finalShotViewForFrame(frame: number): FinalShotView {
  const view = finalViewForFrame(frame);
  return {
    date: finalShotState.date,
    link: finalShotState.link,
    dateStyle: view.dateStyle,
    linkStyle: view.linkStyle,
  };
}
