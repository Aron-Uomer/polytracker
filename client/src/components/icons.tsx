// Lightweight inline SVG icons (Lucide-style: 24x24, 1.75 stroke, currentColor).
// Used instead of emoji so icons are crisp, themeable and consistent.

type P = { className?: string };
const base = (className = "h-5 w-5") => ({
  className,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const SearchIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3-3" />
  </svg>
);

export const TrophyIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
    <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    <path d="M12 13v4M9 21h6M10 17h4l.5 4h-5l.5-4Z" />
  </svg>
);

export const StarIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.1l1-5.8L3.5 9.2l5.9-.9L12 3Z" />
  </svg>
);

export const TargetIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="0.6" fill="currentColor" />
  </svg>
);

export const WalletIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M3 7a2 2 0 0 1 2-2h12v4M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6" />
    <circle cx="17" cy="14" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const ChartIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 19V5M4 19h16" />
    <path d="M8 16v-4M12 16V8M16 16v-6" />
  </svg>
);

export const CoinsIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <ellipse cx="9" cy="7" rx="6" ry="3" />
    <path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7" />
    <path d="M15 11.5c2.9.2 6 1.4 6 3.5 0 1.7-2.7 3-6 3-1.5 0-2.9-.3-4-.7" />
  </svg>
);

export const RefreshIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
  </svg>
);

export const ExternalIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
  </svg>
);

export const PlusIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const CheckIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="m20 6-11 11-5-5" />
  </svg>
);

export const MenuIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const XIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const UserIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20a8 8 0 0 1 16 0" />
  </svg>
);

export const CrownIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M3 7l4 4 5-6 5 6 4-4-2 12H5L3 7Z" />
  </svg>
);

export const BoltIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  </svg>
);

export const ArrowUpRight = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);

export const ColumnsIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="3" y="4" width="7" height="16" rx="1.5" />
    <rect x="14" y="4" width="7" height="16" rx="1.5" />
  </svg>
);

export const ChevronLeft = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="m15 6-6 6 6 6" />
  </svg>
);

export const ChevronRight = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);
