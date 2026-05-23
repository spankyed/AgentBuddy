import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';

export const agentBuddyIntroSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
});

type AgentBuddyIntroProps = z.infer<typeof agentBuddyIntroSchema>;

export const AgentBuddyIntro = ({ title, subtitle }: AgentBuddyIntroProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleProgress = spring({
    frame,
    fps,
    config: {
      damping: 18,
      stiffness: 120,
    },
  });

  const subtitleOpacity = interpolate(frame, [35, 60], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const accentScale = interpolate(frame, [0, 120], [0.85, 1.15], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: '#101417',
        color: '#f7fbff',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        overflow: 'hidden',
      }}
    >
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle at 18% 22%, rgba(40, 180, 154, 0.35), transparent 28%), linear-gradient(135deg, #101417 0%, #172127 52%, #1b2830 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 96,
          border: '1px solid rgba(255, 255, 255, 0.14)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 150,
          top: 126,
          width: 360,
          height: 360,
          borderRadius: 180,
          border: '24px solid rgba(111, 214, 190, 0.22)',
          transform: `scale(${accentScale})`,
        }}
      />
      <main
        style={{
          position: 'absolute',
          left: 180,
          right: 180,
          bottom: 210,
        }}
      >
        <div
          style={{
            width: 112,
            height: 8,
            background: '#6fd6be',
            marginBottom: 42,
            transform: `scaleX(${titleProgress})`,
            transformOrigin: 'left center',
          }}
        />
        <h1
          style={{
            fontSize: 148,
            lineHeight: 0.94,
            margin: 0,
            letterSpacing: 0,
            transform: `translateY(${interpolate(titleProgress, [0, 1], [44, 0])}px)`,
            opacity: titleProgress,
          }}
        >
          {title}
        </h1>
        <p
          style={{
            maxWidth: 920,
            margin: '34px 0 0',
            color: 'rgba(247, 251, 255, 0.78)',
            fontSize: 46,
            lineHeight: 1.18,
            opacity: subtitleOpacity,
          }}
        >
          {subtitle}
        </p>
      </main>
    </AbsoluteFill>
  );
};
