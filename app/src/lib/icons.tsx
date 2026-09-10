import { CSSProperties } from "react";

export type IconProps = { size?: number; style?: CSSProperties; className?: string };

function base(paths: React.ReactNode, { size = 18, style, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
    >
      {paths}
    </svg>
  );
}

export const IconWraith = (p: IconProps) =>
  base(
    <>
      <path d="M12 2 4 6v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6l-8-4Z" />
      <path d="M9 11.5 11 13.5 15 9.5" />
    </>,
    p
  );
export const IconHome = (p: IconProps) => base(<><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9h13v-9" /></>, p);
export const IconShield = (p: IconProps) => base(<><path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6l-7-3Z" /></>, p);
export const IconList = (p: IconProps) => base(<><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1.3" /><circle cx="3.5" cy="12" r="1.3" /><circle cx="3.5" cy="18" r="1.3" /></>, p);
export const IconRepeat = (p: IconProps) => base(<><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>, p);
export const IconCode = (p: IconProps) => base(<><path d="M9 8 4 12l5 4" /><path d="M15 8l5 4-5 4" /></>, p);
export const IconWave = (p: IconProps) => base(<><path d="M2 12h3l2-7 4 14 3-10 2 3h6" /></>, p);
export const IconKey = (p: IconProps) => base(<><circle cx="8" cy="14" r="4" /><path d="M11 11l9-9" /><path d="M16 6l2 2" /><path d="M19 3l2 2" /></>, p);
export const IconTerminal = (p: IconProps) => base(<><rect x="3" y="4" width="18" height="16" rx="2.2" /><path d="M7 9l3 3-3 3" /><path d="M13 15h4" /></>, p);
export const IconSpider = (p: IconProps) => base(<><circle cx="12" cy="12" r="3" /><path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.5 5.5l4.2 4.2M14.3 14.3l4.2 4.2M18.5 5.5l-4.2 4.2M9.7 14.3l-4.2 4.2" /></>, p);
export const IconSettings = (p: IconProps) => base(<><circle cx="12" cy="12" r="3.2" /><path d="M19.4 13a7.9 7.9 0 0 0 0-2l2-1.5-2-3.4-2.3.9a8 8 0 0 0-1.7-1L15 3h-4l-.4 2.9a8 8 0 0 0-1.7 1l-2.3-.9-2 3.4L6.6 11a7.9 7.9 0 0 0 0 2l-2 1.5 2 3.4 2.3-.9a8 8 0 0 0 1.7 1L10 21h4l.4-2.9a8 8 0 0 0 1.7-1l2.3.9 2-3.4-2-1.6Z" /></>, p);
export const IconCopy = (p: IconProps) => base(<><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>, p);
export const IconPlay = (p: IconProps) => base(<path d="M7 4.5v15l13-7.5-13-7.5Z" />, p);
export const IconStop = (p: IconProps) => base(<rect x="6" y="6" width="12" height="12" rx="2" />, p);
export const IconTrash = (p: IconProps) => base(<><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>, p);
export const IconStar = (p: IconProps & { filled?: boolean }) =>
  base(<path d="M12 3.5l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.4l-5.4 2.9 1-6-4.4-4.4 6.1-.9L12 3.5Z" fill={p.filled ? "currentColor" : "none"} />, p);
export const IconSend = (p: IconProps) => base(<><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" /></>, p);
export const IconPlus = (p: IconProps) => base(<><path d="M12 5v14M5 12h14" /></>, p);
export const IconX = (p: IconProps) => base(<path d="M5 5l14 14M19 5 5 19" />, p);
export const IconMinus = (p: IconProps) => base(<path d="M5 12h14" />, p);
export const IconSquare = (p: IconProps) => base(<rect x="6" y="6" width="12" height="12" rx="1.5" />, p);
export const IconExternal = (p: IconProps) => base(<><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></>, p);
export const IconChevronDown = (p: IconProps) => base(<path d="M6 9l6 6 6-6" />, p);
export const IconWifi = (p: IconProps) => base(<><path d="M3 9a15 15 0 0 1 18 0" /><path d="M6.5 13a10 10 0 0 1 11 0" /><path d="M10 17a5 5 0 0 1 4 0" /><circle cx="12" cy="20.2" r="0.8" fill="currentColor" /></>, p);
export const IconLock = (p: IconProps) => base(<><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></>, p);
export const IconWarning = (p: IconProps) => base(<><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4" /><circle cx="12" cy="17" r="0.8" fill="currentColor" /></>, p);
export const IconCheck = (p: IconProps) => base(<path d="M5 13l4 4L19 7" />, p);
export const IconDownload = (p: IconProps) => base(<><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></>, p);
export const IconUpload = (p: IconProps) => base(<><path d="M12 21V9" /><path d="M7 14l5-5 5 5" /><path d="M5 20h14" /></>, p);
export const IconJwt = (p: IconProps) =>
  base(
    <>
      <circle cx="4.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M6.6 12h3.8M13.6 12h3.8" />
    </>,
    p
  );
export const IconAi = (p: IconProps) =>
  base(
    <>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
      <rect x="7.5" y="7.5" width="9" height="9" rx="2.5" />
    </>,
    p
  );
export const IconFlag = (p: IconProps) => base(<><path d="M6 3v18" /><path d="M6 4h12l-3 4 3 4H6" /></>, p);
export const IconLoader = (p: IconProps) => base(<path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />, p);
export const IconZap = (p: IconProps) => base(<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />, p);
export const IconLink = (p: IconProps) =>
  base(
    <>
      <path d="M9.5 14.5l5-5" />
      <path d="M8 16.5 5.5 19a3 3 0 0 1-4-4.5L4 12" />
      <path d="M16 7.5 18.5 5a3 3 0 0 1 4 4.5L20 12" />
    </>,
    p
  );
export const IconRace = (p: IconProps) =>
  base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>,
    p
  );
export const IconUsers = (p: IconProps) =>
  base(
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6" />
      <path d="M16 8.5c1.5 0.3 2.5 1.6 2.5 3s-1 2.7-2.5 3" />
      <path d="M20.5 20c0-2.7-1.8-5-4-5.7" />
    </>,
    p
  );
export const IconCompare = (p: IconProps) =>
  base(
    <>
      <path d="M8 4v16" />
      <path d="M16 4v16" />
      <path d="M4 9h4M4 15h4" />
      <path d="M16 9h4M16 15h4" />
    </>,
    p
  );
