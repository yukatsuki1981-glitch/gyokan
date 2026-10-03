const ICON_PROPS = {
  fill: "none" as const,
  viewBox: "0 0 24 24",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function XIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function TrashIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M4 7h16M9 7V5h6v2M10 11v6M14 11v6M6 7l1 13h10l1-13" />
    </svg>
  );
}

export function GripIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className} strokeWidth={2}>
      <circle cx="9" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LockIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
