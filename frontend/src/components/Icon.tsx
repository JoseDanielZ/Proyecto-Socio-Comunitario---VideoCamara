const PATHS = {
  home: "M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z",
  visits:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0 2c-3 0-6 1.5-6 4v2h12v-2c0-2.5-3-4-6-4Zm8-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm.5 2.6c2.5.3 4.5 1.6 4.5 3.9v2h-4v-2.3c0-1.5-.2-2.8-.5-3.6Z",
  camera:
    "M4 8a2 2 0 0 1 2-2h1.6l1-1.6A1 1 0 0 1 9.5 4h5a1 1 0 0 1 .9.4L16.4 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Zm8 1.5a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Z",
  ticket:
    "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2.5a2.5 2.5 0 0 0 0-5Zm5 2v6h6V9Z",
  access:
    "M5 16.5V12l1.6-4.2A2 2 0 0 1 8.5 6.5h7a2 2 0 0 1 1.9 1.3L19 12v4.5a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1V16H8v.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1ZM7.4 11h9.2l-1-2.5H8.4ZM8 13.2a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Zm8 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z",
  users:
    "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-7 1.7-7 4.5V20h14v-1.5c0-2.8-3.7-4.5-7-4.5Z",
  check: "m5 12.5 4.5 4.5L19 7.5",
  alert: "M12 4 2.8 19.5h18.4zm0 5.5v5m0 2.6v.1",
  question: "M9.2 9.2a2.9 2.9 0 1 1 4.3 2.5c-.9.5-1.5 1.1-1.5 2.1M12 17.6v.1",
  slash: "M6 6l12 12M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
  plus: "M12 5v14M5 12h14",
  chevron: "m9 6 6 6-6 6",
  logout: "M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4M14 8l4 4-4 4M18 12H9",
  refresh: "M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5",
  moto: "M5.5 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm13 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM5.5 15h4l3-6h3.5l2 4M11 9H9",
} as const;

export type IconName = keyof typeof PATHS;

const STROKE_ICONS = new Set<IconName>(["check", "alert", "question", "slash", "plus", "chevron", "logout", "refresh", "moto"]);

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const stroke = STROKE_ICONS.has(name);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill={stroke ? "none" : "currentColor"}
      stroke={stroke ? "currentColor" : "none"}
      strokeWidth={stroke ? 2.2 : 0}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
