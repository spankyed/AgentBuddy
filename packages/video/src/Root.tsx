import { Composition } from 'remotion';
import { AgentBuddyIntro, agentBuddyIntroSchema } from './compositions/AgentBuddyIntro';
import { ElectronCaptureDemo, electronCaptureDemoSchema } from './compositions/ElectronCaptureDemo';
import { CinematicProductDemo, cinematicProductDemoSchema } from './compositions/CinematicProductDemo';
import { cinematicProductDemo, productIntroDemo } from './demo/product-intro';

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="AgentBuddyIntro"
        component={AgentBuddyIntro}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        schema={agentBuddyIntroSchema}
        defaultProps={{
          title: 'AgentBuddy',
          subtitle: 'Build and run AI agent workflows',
        }}
      />
      <Composition
        id="ElectronCaptureDemo"
        component={ElectronCaptureDemo}
        durationInFrames={productIntroDemo.durationInFrames}
        fps={productIntroDemo.fps}
        width={productIntroDemo.width}
        height={productIntroDemo.height}
        schema={electronCaptureDemoSchema}
        defaultProps={{
          scenes: productIntroDemo.scenes.map(scene => ({
            ...scene,
            src: '',
            captureMetadata: {
              viewport: {width: productIntroDemo.width, height: productIntroDemo.height, devicePixelRatio: 1},
              targets: {},
            },
          })),
        }}
      />
      <Composition
        id="CinematicProductDemo"
        component={CinematicProductDemo}
        durationInFrames={cinematicProductDemo.durationInFrames}
        fps={cinematicProductDemo.fps}
        width={cinematicProductDemo.width}
        height={cinematicProductDemo.height}
        schema={cinematicProductDemoSchema}
        defaultProps={{
          scenes: cinematicProductDemo.scenes.map(scene => ({
            ...scene,
            src: '',
            captureMetadata: {
              viewport: {width: cinematicProductDemo.width, height: cinematicProductDemo.height, devicePixelRatio: 1},
              targets: {},
            },
          })),
        }}
      />
    </>
  );
};
