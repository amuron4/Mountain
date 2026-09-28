/** 外部アイコンフォントを使わない軽量な SVG アイコン */
const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  mountain: 'M2.5 20 9 8.5l3.6 6 2.4-3.8L21.5 20zM7.4 11.3l1.6 1.4 1.4-1.2',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6',
  compass: 'M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zM15.8 8.2l-2.3 5.3-5.3 2.3 2.3-5.3z',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  plus: 'M12 5v14M5 12h14',
  star: 'M12 3.2l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.4 2.8 1-6L3.3 9.6l6-.9z',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.8-4.8',
  filter: 'M4 5h16l-6.2 7.6V19l-3.6-1.8v-4.6z',
  back: 'M15 18l-6-6 6-6',
  right: 'M9 6l6 6-6 6',
  down: 'M6 9l6 6 6-6',
  edit: 'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17zM14.5 6.5l3 3',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6 6 18',
  download: 'M12 4v11M7 10.5l5 5 5-5M4 20h16',
  upload: 'M12 16V5M7 9.5l5-5 5 5M4 20h16',
  compare: 'M4 5h6v14H4zM14 5h6v14h-6z',
  sort: 'M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.2 2',
  route: 'M5 19c4.5 0 3-7 7-7s3.5-7 7-7M5 19h.01M19 5h.01',
  up: 'M4 19 10 9l3 4 2.5-3L20 19M17 4v5M14.8 6 17 3.8 19.2 6',
  flag: 'M5 21V4h12l-2.5 4L17 12H5',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  tag: 'M3 12V4h8l9.5 9.5-8 8zM7.5 7.5h.01',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  share: 'M12 4v11M7.5 8.5 12 4l4.5 4.5M5 13v6h14v-6',
  arrowUp: 'M12 19V6M6.5 11.5 12 6l5.5 5.5',
  arrowDown: 'M12 5v13M6.5 12.5 12 18l5.5-5.5',
  train: 'M7 3h10a2 2 0 0 1 2 2v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2zM5 11h14M8 21l2-3M16 21l-2-3M9 14.5h.01M15 14.5h.01',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5h.01',
  restore: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4',
};

interface Props {
  name: keyof typeof PATHS | string;
  size?: number;
  filled?: boolean;
  strokeWidth?: number;
  class?: string;
}

export function Icon({ name, size = 22, filled = false, strokeWidth = 1.9, class: cls }: Props) {
  return (
    <svg
      class={cls}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  );
}
