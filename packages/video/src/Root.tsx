import { Composition } from 'remotion';
import { AgentBuddyIntro, agentBuddyIntroSchema } from './compositions/AgentBuddyIntro';

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
    </>
  );
};
