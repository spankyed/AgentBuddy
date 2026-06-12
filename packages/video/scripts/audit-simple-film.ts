import {cutFrames} from '../src/film/state/timeline';
import {montageDissolveFrames, montageSegmentBoundaries} from '../src/film/state/montage';
import {workflowBeats} from '../src/film/state/workflow';
import {
  simpleSceneCuts,
  simpleSceneSourceDurations,
  simpleScenes,
  simpleTotalFrames,
  type SimpleContentId,
} from '../src/film/simple/timeline';

// Structural audit for the simple (full-UI, hard-cut) film: scene durations
// must match their EDLs, frame remaps must stay monotonic and endpoint-exact,
// cuts must stay clear of montage dissolves, and the locked chapter copy must
// appear exactly as written in LAUNCH_FILM_GOAL.md.

type Failure = {check: string; detail: string};
const failures: Failure[] = [];
let checks = 0;

function check(name: string, pass: boolean, detail: string) {
  checks += 1;
  if (!pass) failures.push({check: name, detail});
}

const contentScenes = simpleScenes.filter(scene => !scene.card);

for (const scene of contentScenes) {
  const id = scene.id as SimpleContentId;
  const source = simpleSceneSourceDurations[id];
  const cuts = simpleSceneCuts[id] ?? [];
  const removed = cuts.reduce((sum, cut) => sum + cut.remove, 0);

  check(
    'scene duration matches EDL',
    scene.duration === source - removed,
    `${id}: duration ${scene.duration} !== source ${source} - removed ${removed}`,
  );

  const sorted = cuts.every((cut, index) => index === 0 || cuts[index - 1].at < cut.at);
  check('cuts sorted ascending', sorted, `${id}: cuts not sorted by at`);

  let previous = -1;
  let monotonic = true;
  for (let frame = 0; frame < scene.duration; frame += 1) {
    const mapped = cutFrames(frame, cuts);
    if (mapped <= previous) monotonic = false;
    previous = mapped;
  }
  check('frame remap strictly increasing', monotonic, `${id}: cutFrames not strictly increasing`);
  check(
    'frame remap endpoint-exact',
    cutFrames(scene.duration - 1, cuts) === source - 1,
    `${id}: last presented frame maps to ${cutFrames(scene.duration - 1, cuts)}, expected ${source - 1}`,
  );
}

const montageCuts = simpleSceneCuts.montage ?? [];
for (const boundary of montageSegmentBoundaries) {
  for (const cut of montageCuts) {
    check(
      'montage cuts clear of dissolve windows',
      cut.at < boundary - 4 || cut.at > boundary + montageDissolveFrames + 2,
      `montage cut at ${cut.at} lands inside dissolve window around boundary ${boundary}`,
    );
  }
}

check(
  'workflow cut splices straight into action beats',
  cutFrames(80, simpleSceneCuts.workflow ?? []) === workflowBeats.action1.from,
  `presented frame 80 maps to ${cutFrames(80, simpleSceneCuts.workflow ?? [])}, expected ${workflowBeats.action1.from}`,
);

const lockedCards = [
  'AgentBuddy is...',
  'More than just an AI chat',
  'More than just a note taker',
  'More than just an IDE',
  'More than just a workflow engine',
  'More than just a calendar',
];
const cardTitles = simpleScenes.filter(scene => scene.card).map(scene => scene.card?.title);
check(
  'chapter cards use the locked copy in order',
  JSON.stringify(cardTitles) === JSON.stringify(lockedCards),
  `cards are ${JSON.stringify(cardTitles)}`,
);
check(
  'revolution copy appears only as the final lockup',
  !cardTitles.some(title => title?.includes('revolution')) && simpleScenes[simpleScenes.length - 1].id === 'final',
  'revolution copy duplicated on a card or final scene misplaced',
);

check(
  'total frames equal scene sum',
  simpleTotalFrames === simpleScenes.reduce((sum, scene) => sum + scene.duration, 0),
  `simpleTotalFrames ${simpleTotalFrames}`,
);

if (failures.length > 0) {
  console.error(`Simple film audit failed: ${failures.length} of ${checks} checks.`);
  for (const failure of failures) {
    console.error(`- [${failure.check}] ${failure.detail}`);
  }
  process.exit(1);
}

console.log(`Simple film audit passed: ${checks} structural checks across ${contentScenes.length} scenes.`);
