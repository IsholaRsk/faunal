import type { SVGProps } from 'react';

/**
 * FAUNAL icon set — hand-tuned minimal strokes (spec §6: no emoji icons).
 * Single file so both surfaces share the exact same glyph language.
 */
export type IconName = keyof typeof PATHS;

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const PATHS = {
  home: <><path d="M4 10.5 12 4l8 6.5" {...STROKE} /><path d="M6 9.5V20h12V9.5" {...STROKE} /></>,
  compass: <><circle cx="12" cy="12" r="8.25" {...STROKE} /><path d="m14.8 9.2-1.9 4.4-4.4 1.9 1.9-4.4z" {...STROKE} /></>,
  heart: <path d="M12 20s-7.5-4.35-7.5-9.4A4.1 4.1 0 0 1 12 8.2a4.1 4.1 0 0 1 7.5 2.4C19.5 15.65 12 20 12 20Z" {...STROKE} />,
  cart: <><path d="M4 7h16l-1.4 10.2a1.8 1.8 0 0 1-1.8 1.6H7.2a1.8 1.8 0 0 1-1.8-1.6Z" {...STROKE} /><path d="M9 7a3 3 0 0 1 6 0" {...STROKE} /></>,
  user: <><circle cx="12" cy="8.5" r="3.75" {...STROKE} /><path d="M5 20c.7-3.6 3.5-5.6 7-5.6s6.3 2 7 5.6" {...STROKE} /></>,
  search: <><circle cx="11" cy="11" r="6.5" {...STROKE} /><path d="m16 16 4 4" {...STROKE} /></>,
  bell: <><path d="M7 10a5 5 0 0 1 10 0c0 4 1.5 5.5 1.5 5.5h-13S7 14 7 10Z" {...STROKE} /><path d="M10.5 18.5a1.7 1.7 0 0 0 3 0" {...STROKE} /></>,
  back: <path d="m14.5 6-6 6 6 6" {...STROKE} />,
  chevronRight: <path d="m9.5 6 6 6-6 6" {...STROKE} />,
  chevronDown: <path d="m6 9.5 6 6 6-6" {...STROKE} />,
  close: <><path d="m7 7 10 10" {...STROKE} /><path d="m17 7-10 10" {...STROKE} /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" {...STROKE} />,
  plus: <><path d="M12 5v14" {...STROKE} /><path d="M5 12h14" {...STROKE} /></>,
  minus: <path d="M5 12h14" {...STROKE} />,
  trash: <><path d="M4.5 7h15" {...STROKE} /><path d="M9 7V5h6v2" {...STROKE} /><path d="M6.5 7 7.8 20h8.4L17.5 7" {...STROKE} /></>,
  share: <><path d="M12 16V4" {...STROKE} /><path d="m8.5 7.5 3.5-3.5 3.5 3.5" {...STROKE} /><path d="M5 14v5.5h14V14" {...STROKE} /></>,
  filter: <><path d="M4 7h16" {...STROKE} /><path d="M7 12h10" {...STROKE} /><path d="M10 17h4" {...STROKE} /></>,
  sliders: <><path d="M5 8h9M18 8h1" {...STROKE} /><path d="M5 16h3M12 16h7" {...STROKE} /><circle cx="16" cy="8" r="2" {...STROKE} /><circle cx="10" cy="16" r="2" {...STROKE} /></>,
  sort: <><path d="M7 5v14M7 19l-2.5-2.5M7 19l2.5-2.5" {...STROKE} /><path d="M13 7h7M13 12h5M13 17h3" {...STROKE} /></>,
  star: <path d="m12 4.5 2.35 4.9 5.15.72-3.75 3.7.9 5.28L12 16.7l-4.65 2.4.9-5.28-3.75-3.7 5.15-.72z" {...STROKE} />,
  shield: <><path d="M12 4 5.5 6.4v5.1c0 4 2.7 7 6.5 8.5 3.8-1.5 6.5-4.5 6.5-8.5V6.4z" {...STROKE} /><path d="m9.3 12 1.9 1.9 3.6-3.7" {...STROKE} /></>,
  verified: <><path d="m12 3.8 2 1.5 2.5-.3.8 2.4 2.1 1.4-.9 2.4.9 2.4-2.1 1.4-.8 2.4-2.5-.3-2 1.5-2-1.5-2.5.3-.8-2.4-2.1-1.4.9-2.4-.9-2.4L4.2 8.9 5 6.5l2.5.3z" {...STROKE} /><path d="m9.4 12 1.8 1.8 3.4-3.6" {...STROKE} /></>,
  location: <><path d="M12 21s6.5-6.1 6.5-10.4A6.5 6.5 0 0 0 5.5 10.6C5.5 14.9 12 21 12 21Z" {...STROKE} /><circle cx="12" cy="10.3" r="2.4" {...STROKE} /></>,
  chat: <path d="M20 12.5c0 3.6-3.6 6.5-8 6.5-1 0-2-.15-2.9-.44L5 20l1.2-3A6.6 6.6 0 0 1 4 12.5C4 8.9 7.6 6 12 6s8 2.9 8 6.5Z" {...STROKE} />,
  truck: <><path d="M3 7h11v9H3z" {...STROKE} /><path d="M14 10h4l3 3v3h-7z" {...STROKE} /><circle cx="7" cy="18" r="1.6" {...STROKE} /><circle cx="17.5" cy="18" r="1.6" {...STROKE} /></>,
  box: <><path d="m12 3.6 7.5 3.6v9.6L12 20.4 4.5 16.8V7.2z" {...STROKE} /><path d="M4.5 7.2 12 10.8l7.5-3.6M12 10.8v9.6" {...STROKE} /></>,
  card: <><rect x="3.5" y="6" width="17" height="12" rx="2.2" {...STROKE} /><path d="M3.5 10h17" {...STROKE} /></>,
  doc: <><path d="M6 3.5h7.5L18 8v12.5H6z" {...STROKE} /><path d="M13.5 3.5V8H18" {...STROKE} /><path d="M8.5 12h7M8.5 15.5h7" {...STROKE} /></>,
  image: <><rect x="4" y="5.5" width="16" height="13" rx="2" {...STROKE} /><circle cx="9" cy="10.5" r="1.5" {...STROKE} /><path d="m5 17 4.5-4 3 2.5 3-2.5L19 17" {...STROKE} /></>,
  video: <><rect x="3.5" y="6.5" width="12" height="11" rx="2" {...STROKE} /><path d="m15.5 11 5-2.5v7L15.5 13z" {...STROKE} /></>,
  camera: <><path d="M4 8.5h3l1.5-2h7L17 8.5h3v10H4z" {...STROKE} /><circle cx="12" cy="13" r="3.2" {...STROKE} /></>,
  calendar: <><rect x="4" y="5.5" width="16" height="14" rx="2" {...STROKE} /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" {...STROKE} /></>,
  clock: <><circle cx="12" cy="12" r="8" {...STROKE} /><path d="M12 7.5V12l3 2" {...STROKE} /></>,
  gear: <><circle cx="12" cy="12" r="3" {...STROKE} /><path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M18 6l-1.4 1.4M7.4 16.6 6 18M18 18l-1.4-1.4M7.4 7.4 6 6" {...STROKE} /></>,
  logout: <><path d="M14 5.5H6.5v13H14" {...STROKE} /><path d="M11 12h9m0 0-2.6-2.6M20 12l-2.6 2.6" {...STROKE} /></>,
  alert: <><path d="M12 4.5 20 19H4z" {...STROKE} /><path d="M12 10v4" {...STROKE} /><circle cx="12" cy="16.6" r=".7" fill="currentColor" stroke="none" /></>,
  info: <><circle cx="12" cy="12" r="8" {...STROKE} /><path d="M12 11v5.5" {...STROKE} /><circle cx="12" cy="8.3" r=".8" fill="currentColor" stroke="none" /></>,
  lock: <><rect x="5.5" y="10.5" width="13" height="9.5" rx="2" {...STROKE} /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" {...STROKE} /></>,
  eye: <><path d="M2.8 12S6 6.8 12 6.8 21.2 12 21.2 12 18 17.2 12 17.2 2.8 12 2.8 12Z" {...STROKE} /><circle cx="12" cy="12" r="2.6" {...STROKE} /></>,
  sparkle: <><path d="M12 4.2l1.6 4 4 1.6-4 1.6L12 15.4 10.4 11.4l-4-1.6 4-1.6z" {...STROKE} /><path d="M18.4 15.2l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" {...STROKE} /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.4" {...STROKE} /><rect x="13" y="4" width="7" height="7" rx="1.4" {...STROKE} /><rect x="4" y="13" width="7" height="7" rx="1.4" {...STROKE} /><rect x="13" y="13" width="7" height="7" rx="1.4" {...STROKE} /></>,
  leaf: <><path d="M5 19C4 12 8 5.5 19 5c.5 8.5-4 13-9.5 13A4.5 4.5 0 0 1 5 19Z" {...STROKE} /><path d="M6.5 17.5C9 14 12.5 11.5 16 10.5" {...STROKE} /></>,
  bug: <><ellipse cx="12" cy="13.5" rx="4.5" ry="5.5" {...STROKE} /><path d="M12 8V6m-2.5-1.5L12 6l2.5-1.5M7.5 11 4 9.5M7.5 14H4M8 17.5 5 19.5M16.5 11 20 9.5M16.5 14H20M16 17.5 19 19.5" {...STROKE} /></>,
  paw: <><circle cx="8" cy="9" r="1.8" {...STROKE} /><circle cx="12" cy="7" r="1.8" {...STROKE} /><circle cx="16" cy="9" r="1.8" {...STROKE} /><path d="M12 12c2.6 0 4.6 2 4.6 4.2 0 1.6-1.4 2.6-3 2.2-1-.25-2.2-.25-3.2 0-1.6.4-3-.6-3-2.2C7.4 14 9.4 12 12 12Z" {...STROKE} /></>,
  scale: <><path d="M12 4.5v15M6 19.5h12" {...STROKE} /><path d="M4 11 8 6l4 5a4 4 0 0 1-8 0ZM12 11l4-5 4 5a4 4 0 0 1-8 0Z" {...STROKE} /></>,
  thermometer: <><path d="M10 14.5V6a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0Z" {...STROKE} /><circle cx="12" cy="17.5" r="1.4" fill="currentColor" stroke="none" /></>,
  drop: <path d="M12 4.5s5 5.6 5 9a5 5 0 0 1-10 0c0-3.4 5-9 5-9Z" {...STROKE} />,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2" {...STROKE} /><path d="M15.5 5.5h-11v11" {...STROKE} /></>,
  external: <><path d="M14 5h5v5" {...STROKE} /><path d="M19 5l-7.5 7.5" {...STROKE} /><path d="M18 14v5H6V7h5" {...STROKE} /></>,
  refresh: <><path d="M19 12a7 7 0 1 1-2.3-5.2" {...STROKE} /><path d="M19.5 5v3.5H16" {...STROKE} /></>,
  flag: <><path d="M6 4v16" {...STROKE} /><path d="M6 5h11l-2 3.5L17 12H6z" {...STROKE} /></>,
  ban: <><circle cx="12" cy="12" r="8" {...STROKE} /><path d="m6.5 17.5 11-11" {...STROKE} /></>,
  phone: <path d="M6.5 4h3l1.3 3.4-1.8 1.4a9.6 9.6 0 0 0 4.8 4.8l1.4-1.8L18.6 13v3a1.6 1.6 0 0 1-1.7 1.6C10 17.2 5.8 12 5.4 6.1A1.6 1.6 0 0 1 6.5 4Z" {...STROKE} />,
  mail: <><rect x="3.5" y="6" width="17" height="12" rx="2" {...STROKE} /><path d="m4.5 7.5 7.5 5.5 7.5-5.5" {...STROKE} /></>,
  chart: <><path d="M4 19.5V9M9.5 19.5V4.5M15 19.5v-7M20.5 19.5v-11" {...STROKE} /></>,
  dollar: <><path d="M12 4v16" {...STROKE} /><path d="M15.5 8.2c-.6-1.3-2-2-3.6-2-2 0-3.4 1.1-3.4 2.7 0 4 7 2 7 6.1 0 1.7-1.5 2.9-3.6 2.9-1.9 0-3.4-.9-3.9-2.4" {...STROKE} /></>,
  tag: <><path d="M4.5 11.5 11.5 4.5H19v7.5l-7 7z" {...STROKE} /><circle cx="15.5" cy="8.5" r="1.3" {...STROKE} /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" {...STROKE} /></>,
  userPlus: <><circle cx="10" cy="8.5" r="3.5" {...STROKE} /><path d="M4 20c.6-3.4 3-5.3 6-5.3 1.2 0 2.3.3 3.2.8" {...STROKE} /><path d="M17.5 14v6M14.5 17h6" {...STROKE} /></>,
  store: <><path d="M4.5 10v9.5h15V10" {...STROKE} /><path d="m3.5 6 1.4-2.5h14.2L20.5 6a2.6 2.6 0 0 1-4.8 1 2.6 2.6 0 0 1-4.9 0 2.6 2.6 0 0 1-4.8-1Z" {...STROKE} /></>,
  book: <><path d="M5 5.5A2 2 0 0 1 7 3.5h12v15H7a2 2 0 0 0-2 2z" {...STROKE} /><path d="M5 18.5v2h14" {...STROKE} /></>,
  apple: <><path d="M12 7c-2-2.6-6-2-6.8 1.2C4.2 12 7 20 9.6 20c1 0 1.5-.6 2.4-.6s1.4.6 2.4.6c2.6 0 5.4-8 4.4-11.8C18 5 14 4.4 12 7Z" {...STROKE} /></>,
} as const;

export function Icon({
  name,
  size = 20,
  filled = false,
  ...rest
}: { name: IconName; size?: number; filled?: boolean } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={filled ? { fill: 'currentColor' } : undefined}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

export function Logo({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className} aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" rx="10" fill="#151515" />
      <path
        d="M13 28.5c-1.4-6 1-12.4 7.4-15.6 2.2 4.6 2 9.2-.6 12.6-2 2.7-4.6 3.7-6.8 3Z"
        fill="none"
        stroke="#F7F7F5"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M14.4 27.2c2.7-3.3 6-5.6 9.6-6.7" fill="none" stroke="#F7F7F5" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
