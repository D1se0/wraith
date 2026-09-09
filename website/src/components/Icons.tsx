type IconProps = { size?: number };

const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function LogoMark({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <defs>
        <linearGradient id="wraith-logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#37e6c4" />
          <stop offset="1" stopColor="#7c5cff" />
        </linearGradient>
      </defs>
      <path
        d="M6 12 C6 6 10.5 3 16 3 C21.5 3 26 6 26 12 L26 24 C26 26 24 27.5 22.5 26 L20 23.5 L17.5 26 C16.6 26.9 15.4 26.9 14.5 26 L12 23.5 L9.5 26 C8 27.5 6 26 6 24 Z"
        fill="url(#wraith-logo-grad)"
        opacity="0.92"
      />
      <circle cx="12.5" cy="13" r="1.8" fill="#0a0d14" />
      <circle cx="19.5" cy="13" r="1.8" fill="#0a0d14" />
    </svg>
  );
}

export function IconProxy({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function IconCapture({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M2 12h4l2-7 4 14 2-7h4" />
      <circle cx="20" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCracker({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M17 3l3 3M20 6l2 2" />
    </svg>
  );
}

export function IconCurl({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M7 9l3 3-3 3M13 15h4" />
    </svg>
  );
}

export function IconCrawler({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <circle cx="12" cy="12" r="2.4" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </svg>
  );
}

export function IconDecoder({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M8 4C5 4 5 8 5 8s0 4-3 4c3 0 3 4 3 4s0 4 3 4" />
      <path d="M16 4c3 0 3 4 3 4s0 4 3 4c-3 0-3 4-3 4s0 4-3 4" />
    </svg>
  );
}

export function IconGithub({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.21-3.37-1.21-.46-1.2-1.11-1.52-1.11-1.52-.91-.64.07-.63.07-.63 1 .07 1.53 1.05 1.53 1.05.9 1.57 2.34 1.12 2.91.85.09-.67.35-1.12.64-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.73 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.81 0 .27.18.6.69.49A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2z" />
    </svg>
  );
}

export function IconWindows({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 5.5L10.5 4.4V11.5H3V5.5zM11.5 4.3L21 3V11.5H11.5V4.3zM3 12.5H10.5V19.6L3 18.5V12.5zM11.5 12.5H21V21L11.5 19.7V12.5z" />
    </svg>
  );
}

export function IconLinux({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2c1.7 0 2.9 1.7 2.9 4 0 1.4-.4 2.2-.4 3.3 0 .6.2 1 .5 1.5 1.7.4 3.4 1.7 3.9 3.3.3 1-.1 1.6-.1 2.3 0 .9.6 1.3.6 2.1 0 1.4-2.4 2.5-7.4 2.5s-7.4-1.1-7.4-2.5c0-.8.6-1.2.6-2.1 0-.7-.4-1.3-.1-2.3.5-1.6 2.2-2.9 3.9-3.3.3-.5.5-.9.5-1.5 0-1.1-.4-1.9-.4-3.3 0-2.3 1.2-4 2.9-4z" />
    </svg>
  );
}

export function IconApple({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.5 1.5c.1 1.2-.4 2.4-1.1 3.3-.7.9-1.9 1.6-3 1.5-.1-1.2.4-2.5 1.1-3.3.8-.9 2.1-1.5 3-1.5zM20.8 17c-.5 1.2-.8 1.7-1.5 2.7-1 1.4-2.3 3.2-4 3.2-1.5 0-1.9-1-3.9-1s-2.5 1-4 1c-1.7 0-3-1.6-4-3-2.7-3.9-3-8.4-1.3-10.9 1.2-1.7 3-2.7 4.7-2.7 1.8 0 2.9 1.1 4.4 1.1s2.2-1.1 4.4-1.1c1.5 0 3.1.8 4.2 2.2-3.7 2-3.1 7.3 1 8.5z" />
    </svg>
  );
}

export function IconMenu({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function IconClose({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
