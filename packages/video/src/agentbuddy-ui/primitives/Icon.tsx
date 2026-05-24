import type {CSSProperties, ReactNode} from 'react';

type IconProps = {
  className?: string;
  size?: number;
  style?: CSSProperties;
};

function Svg({children, className, size = 18, style}: IconProps & {children: ReactNode}) {
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const Icons = {
  Threads: (props: IconProps) => <Svg {...props}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /><path d="M8 9h8" /><path d="M8 13h5" /></Svg>,
  Notes: (props: IconProps) => <Svg {...props}><path d="M8 2h8l4 4v16H4V2z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h8" /></Svg>,
  Code: (props: IconProps) => <Svg {...props}><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /><path d="m14 4-4 16" /></Svg>,
  Flows: (props: IconProps) => <Svg {...props}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M10 7h4" /><path d="M7 10v4" /><path d="M10 17h4" /></Svg>,
  Play: (props: IconProps) => <Svg {...props}><path d="m8 5 11 7-11 7z" /></Svg>,
  Sparkle: (props: IconProps) => <Svg {...props}><path d="m12 3 1.7 5.2L19 10l-5.3 1.8L12 17l-1.7-5.2L5 10l5.3-1.8z" /></Svg>,
  Brain: (props: IconProps) => <Svg {...props}><circle cx="12" cy="12" r="8" /><path d="M8 12h8" /><path d="M12 8v8" /></Svg>,
  Settings: (props: IconProps) => <Svg {...props}><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7.1 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z" /></Svg>,
  Hash: (props: IconProps) => <Svg {...props}><path d="M4 9h16" /><path d="M4 15h16" /><path d="M10 3 8 21" /><path d="m16 3-2 18" /></Svg>,
  Paperclip: (props: IconProps) => <Svg {...props}><path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.5-8.5" /></Svg>,
  Mic: (props: IconProps) => <Svg {...props}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><path d="M12 17v5" /></Svg>,
  CornerDownLeft: (props: IconProps) => <Svg {...props}><path d="M9 10 4 15l5 5" /><path d="M20 4v7a4 4 0 0 1-4 4H4" /></Svg>,
  ChevronRight: (props: IconProps) => <Svg {...props}><path d="m9 18 6-6-6-6" /></Svg>,
  EllipsisVertical: (props: IconProps) => <Svg {...props}><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></Svg>,
  Plus: (props: IconProps) => <Svg {...props}><path d="M12 5v14" /><path d="M5 12h14" /></Svg>,
  ArrowLeft: (props: IconProps) => <Svg {...props}><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></Svg>,
  GitBranch: (props: IconProps) => <Svg {...props}><path d="M6 3v12" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></Svg>,
  Zap: (props: IconProps) => <Svg {...props}><path d="M13 2 3 14h8l-1 8 10-12h-8z" /></Svg>,
  Radio: (props: IconProps) => <Svg {...props}><path d="M4.9 19.1a10 10 0 0 1 0-14.2" /><path d="M7.8 16.2a6 6 0 0 1 0-8.4" /><circle cx="12" cy="12" r="2" /><path d="M16.2 7.8a6 6 0 0 1 0 8.4" /><path d="M19.1 4.9a10 10 0 0 1 0 14.2" /></Svg>,
  Clock: (props: IconProps) => <Svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>,
  Square: (props: IconProps) => <Svg {...props}><rect x="5" y="5" width="14" height="14" rx="1" /></Svg>,
};
