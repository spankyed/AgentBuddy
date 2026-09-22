// How the window's panels are laid out, as pure changes to the sizes. Which of them are saved is the machine's call:
// sizes the user chose are; the chat onboarding maximizes for the moment isn't.
import type { ShellPanelSizes } from '@abuddy/sdk/fe';
import type { ShellStorage } from './types.ts';

const DEFAULT_SIZES: ShellPanelSizes = {
  canvasHeight: 50,
  inspectionWidth: 448,
  chatMaximized: false,
};

/** The sizes a window opens with: the ones the user set last, over the defaults */
export function initialPanelSizes(storage: ShellStorage): ShellPanelSizes {
  return { ...DEFAULT_SIZES, ...storage.loadPanelSizes() };
}

/** A panel dragged to `size`: the canvas as a share of the main area (20–95%), the inspection panel in pixels (300–800) */
export function resized(sizes: ShellPanelSizes, panel: 'canvas' | 'inspection', size: number): ShellPanelSizes {
  return panel === 'canvas'
    ? { ...sizes, canvasHeight: Math.max(20, Math.min(95, size)) }
    : { ...sizes, inspectionWidth: Math.max(300, Math.min(800, size)) };
}

/** The chat filling the main area; a canvas collapsed to almost nothing gets its half back for when it returns */
export function chatMaximized(sizes: ShellPanelSizes): ShellPanelSizes {
  return { ...sizes, chatMaximized: true, ...(sizes.canvasHeight >= 93 ? { canvasHeight: 50 } : {}) };
}

export function chatRestored(sizes: ShellPanelSizes): ShellPanelSizes {
  return { ...sizes, chatMaximized: false };
}

/** The inspection panel collapsed, remembering its width, or back at the width it had */
export function inspectionToggled(sizes: ShellPanelSizes): ShellPanelSizes {
  const collapsed = sizes.inspectionWidth === 0;
  return {
    ...sizes,
    inspectionWidth: collapsed ? (sizes.previousInspectionWidth || DEFAULT_SIZES.inspectionWidth) : 0,
    previousInspectionWidth: collapsed ? sizes.previousInspectionWidth : sizes.inspectionWidth,
  };
}
