import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

function Icon({ children, ...p }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...p}
    >
      {children}
    </svg>
  );
}

export const ShieldIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" />
    <path d="M8.5 12l2.5 2.5 4.5-5" />
  </Icon>
);

export const ClockIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const SoundIcon = ({ muted, ...p }: P & { muted?: boolean }) => (
  <Icon {...p}>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    {muted ? <path d="M17 9l4 6M21 9l-4 6" /> : <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" />}
  </Icon>
);

export const HelpIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 015 .5c0 1.7-2.5 2-2.5 3.5" />
    <circle cx="12" cy="17" r=".6" fill="currentColor" />
  </Icon>
);

export const CloseIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const CheckIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

/** Filled bomb, for chains and history. */
export const BombIcon = (p: P) => (
  <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden {...p}>
    <path d="M15.5 6.5l1.6-1.6" stroke="#c9a36a" strokeWidth="2" strokeLinecap="round" />
    <path d="M18.6 3.2l.8-.8M19.8 5.4h1.1M17.6 2v1.1" stroke="#ffb02e" strokeWidth="1.6" strokeLinecap="round" />
    <rect x="12.6" y="6.4" width="4" height="3" rx="0.6" transform="rotate(45 14.6 7.9)" fill="#6f6f80" />
    <circle cx="10.5" cy="13.5" r="7.5" fill="#1d1d28" stroke="#ff3b5c" strokeWidth="1.4" />
    <ellipse cx="8" cy="10.8" rx="2.2" ry="1.2" transform="rotate(-40 8 10.8)" fill="#fff" opacity="0.45" />
  </svg>
);
