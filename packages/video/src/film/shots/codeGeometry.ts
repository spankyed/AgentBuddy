import {percentTarget, type TargetRect} from '../interaction/cursorTargets';

export type CodeCursorLayout = {
  windowStyle: {
    height?: number | string;
    left?: number | string;
    top?: number | string;
    width?: number | string;
  };
};

export type CodeCursorTargetId =
  | 'createPrButton'
  | 'createPullRequestButton'
  | 'mergePrButton'
  | 'prDescription'
  | 'prTabIcon'
  | 'publishButton'
  | 'sourceControlIcon'
  | 'stageCenter';

// The code-review feature panel is RIGHT-DOCKED and flush to the window's right
// edge with a fixed width (430 landscape, 360 square). Deriving the cursor
// targets from the real app-window box keeps the cursor on the actual elements
// in both variants — the landscape and square windows are inset by different
// margins, so a single viewport-percent target lands on the element in one
// variant and drifts in the other.
//
// Offsets below are the panel's fixed pixel chrome, calibrated against the
// landscape variant (window {32,32,1376,836}) so its rendered positions are
// pixel-identical to the previous hand-tuned percent targets:
//   - 42px breadcrumb chrome header above the panel
//   - 42px "Pull Request" panel header, then a 40px right-aligned icon row
//   - right-aligned toolbar icons / Publish / Create-PR anchor to panelRight
//   - bottom action-bar buttons (create PR, merge PR) anchor to the window bottom
//   - the PR description field sits mid-panel
const PANEL_TOP_CHROME = 42; // breadcrumb header above the feature panel

// Right-aligned toolbar icons (commit = source control, pr = pull request) sit
// in the 40px icon row; X measured leftward from the panel's right edge.
const SOURCE_CONTROL_ICON_FROM_RIGHT = 163.8;
const PR_TAB_ICON_FROM_RIGHT = 132.2;
const ICON_ROW_CENTER_FROM_PANEL_TOP = 62.8; // panel header (42) + half the icon row (20)

// Right-aligned action buttons further down the panel.
const PUBLISH_FROM_RIGHT = 54.4;
const PUBLISH_FROM_PANEL_TOP = 115;
const CREATE_PR_FROM_RIGHT = 18.4;
const CREATE_PR_FROM_PANEL_TOP = 169;

// Mid-panel PR description field.
const PR_DESCRIPTION_FROM_LEFT = 246;
const PR_DESCRIPTION_FROM_PANEL_TOP = 313;

// Bottom action bar — anchored to the window's bottom edge.
const CREATE_PR_BUTTON_FROM_RIGHT = 274.7;
const CREATE_PR_BUTTON_FROM_BOTTOM = 75.1;
const MERGE_PR_BUTTON_FROM_RIGHT = 369.8;
const MERGE_PR_BUTTON_FROM_BOTTOM = 68.8;

type WindowBox = {height: number; left: number; top: number; width: number};

function windowBox(layout: CodeCursorLayout, width: number, height: number): WindowBox {
  return {
    height: Number(layout.windowStyle.height) || height,
    left: Number(layout.windowStyle.left) || 0,
    top: Number(layout.windowStyle.top) || 0,
    width: Number(layout.windowStyle.width) || width,
  };
}

export function codePanelRect(
  layout: CodeCursorLayout,
  variant: 'landscape' | 'square' | undefined,
  width: number,
  height: number,
): {bottom: number; left: number; right: number; top: number; width: number} {
  const box = windowBox(layout, width, height);
  const panelWidth = variant === 'square' ? 360 : 430;
  const right = box.left + box.width;
  return {
    bottom: box.top + box.height,
    left: right - panelWidth,
    right,
    top: box.top + PANEL_TOP_CHROME,
    width: panelWidth,
  };
}

export function codeCursorTargets(
  layout: CodeCursorLayout,
  variant: 'landscape' | 'square' | undefined,
  width: number,
  height: number,
): Record<CodeCursorTargetId, TargetRect> {
  const box = windowBox(layout, width, height);
  const panel = codePanelRect(layout, variant, width, height);
  const panelWidth = panel.width;
  // Cursor starts in the blank left stage, centered in the surface left of the panel.
  const stageCenterX = box.left + (box.width - panelWidth) / 2;
  const stageCenterY = box.top + box.height / 2;
  // Targets are points; widths/heights are small hit boxes matching the prior
  // percent targets so the click ripple covers the element.
  const point = (x: number, y: number, w: number, h: number) =>
    percentTarget(
      ((x - w / 2) / width) * 100,
      ((y - h / 2) / height) * 100,
      (w / width) * 100,
      (h / height) * 100,
    );

  return {
    createPrButton: point(panel.right - CREATE_PR_BUTTON_FROM_RIGHT, panel.bottom - CREATE_PR_BUTTON_FROM_BOTTOM, 58, 27),
    createPullRequestButton: point(panel.right - CREATE_PR_FROM_RIGHT, panel.top + CREATE_PR_FROM_PANEL_TOP, 58, 27),
    mergePrButton: point(panel.right - MERGE_PR_BUTTON_FROM_RIGHT, panel.bottom - MERGE_PR_BUTTON_FROM_BOTTOM, 58, 27),
    prDescription: point(panel.left + PR_DESCRIPTION_FROM_LEFT, panel.top + PR_DESCRIPTION_FROM_PANEL_TOP, 144, 72),
    prTabIcon: point(panel.right - PR_TAB_ICON_FROM_RIGHT, panel.top + ICON_ROW_CENTER_FROM_PANEL_TOP, 40, 27),
    publishButton: point(panel.right - PUBLISH_FROM_RIGHT, panel.top + PUBLISH_FROM_PANEL_TOP, 86, 27),
    sourceControlIcon: point(panel.right - SOURCE_CONTROL_ICON_FROM_RIGHT, panel.top + ICON_ROW_CENTER_FROM_PANEL_TOP, 40, 27),
    stageCenter: point(stageCenterX, stageCenterY, 86, 54),
  };
}
