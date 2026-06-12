import {cutFrames, type FrameCut} from '../state/timeline';

export type SimpleCardId = 'intro-card' | 'chat-card' | 'notes-card' | 'code-card' | 'workflow-card' | 'calendar-card';
export type SimpleContentId = 'chat' | 'board' | 'notes' | 'code' | 'workflow' | 'calendar' | 'montage' | 'final';
export type SimpleSceneId = SimpleCardId | SimpleContentId;

export type SimpleScene = {
  card?: {
    eyebrow?: string;
    subtitle?: string;
    title: string;
  };
  duration: number;
  id: SimpleSceneId;
};

// The simple film keeps the full app UI on screen for every content scene:
// chrome reveals, panel docks, and window springs are all pinned to their
// final state, so these EDLs only have to dodge content motion (cursor
// moves, eases, text reveals) in the source timelines.
export const simpleSceneCuts: Partial<Record<SimpleContentId, FrameCut[]>> = {
  chat: [
    {at: 14, remove: 6},    // quote settled (12), typing starts (24)
    {at: 156, remove: 8},   // hold after reference insert (144-168)
    {at: 292, remove: 13},  // thinking shown (eased 282-290), response at 306
    {at: 362, remove: 7},   // response done (346), plan enters (370)
    {at: 415, remove: 8},   // approve clicked (414), plan resolves (420)
    {at: 483, remove: 3},   // tool rows done (482), hover move starts (486)
    {at: 527, remove: 4},   // hover ends (526), thread loads (532)
    {at: 533, remove: 5},   // thread loaded, next move starts (540)
  ],
  board: [
    {at: 6, remove: 12},    // static dashboard intro, first move starts (22)
    {at: 49, remove: 3},    // pin clicked (48), press state shows (52)
    {at: 123, remove: 6},   // title typed (122), instructions start (130)
    {at: 193, remove: 5},   // link dropdown opened (192), typing starts (200)
    {at: 230, remove: 6},   // stationary hover hold on action link (228-240)
    {at: 240, remove: 4},   // hover ends, move to save starts (244)
    {at: 265, remove: 4},   // form faded out (264), move to kanban starts (270)
  ],
  notes: [
    {at: 86, remove: 10},   // favorites shown (84), cursor move starts (118)
    {at: 320, remove: 8},   // completion typed (318), settle tail remains
  ],
  code: [
    {at: 4, remove: 9},     // static intro, first move starts (18)
    {at: 116, remove: 8},   // commit menu opened (112), action press (128)
    {at: 192, remove: 6},   // move done (190), next move starts (198)
    {at: 246, remove: 8},   // cursor parked (244), terminal swap dip (254)
    {at: 286, remove: 12},  // browser settled (284), exit starts (300)
    {at: 352, remove: 6},   // publish done (350), create move starts (360)
    {at: 387, remove: 5},   // move done (386), next move starts (392)
  ],
  workflow: [
    {at: 80, remove: 88},   // chrome beats pinned: jump from drawn edge (76) to action1 (168)
  ],
  montage: [
    {at: 60, remove: 8},    // chat reply settled (58), logs boundary (72)
    {at: 114, remove: 10},  // log expanded (110), database boundary (142)
    {at: 172, remove: 14},  // first query results settled, next query (196)
    {at: 226, remove: 14},  // second results settled, browser boundary (252)
    {at: 320, remove: 26},  // checkout page loaded (312), settle tail
  ],
};

export const simpleSceneSourceDurations: Record<SimpleContentId, number> = {
  board: 310,
  calendar: 270,
  chat: 630,
  code: 420,
  final: 140,
  montage: 360,
  notes: 330,
  workflow: 260,
};

export function simpleSceneFrame(id: SimpleSceneId, frame: number) {
  const cuts = simpleSceneCuts[id as SimpleContentId];
  return cuts ? cutFrames(frame, cuts) : frame;
}

export const simpleScenes: SimpleScene[] = [
  {id: 'intro-card', card: {eyebrow: '0', title: 'AgentBuddy is...'}, duration: 66},
  {id: 'chat-card', card: {eyebrow: '1', title: 'More than just an AI chat'}, duration: 66},
  {id: 'chat', duration: 576},
  {id: 'board', duration: 270},
  {id: 'notes-card', card: {eyebrow: '2', title: 'More than just a note taker'}, duration: 66},
  {id: 'notes', duration: 312},
  {id: 'code-card', card: {eyebrow: '3', title: 'More than just an IDE'}, duration: 66},
  {id: 'code', duration: 366},
  {id: 'workflow-card', card: {eyebrow: '4', title: 'More than just a workflow engine'}, duration: 66},
  {id: 'workflow', duration: 172},
  {id: 'calendar-card', card: {eyebrow: '5', title: 'More than just a calendar'}, duration: 66},
  {id: 'calendar', duration: 270},
  {id: 'montage', duration: 288},
  {id: 'final', duration: 140},
];

export const simpleTotalFrames = simpleScenes.reduce((sum, scene) => sum + scene.duration, 0);
