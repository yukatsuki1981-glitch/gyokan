"use client";

import Link from "next/link";

export function DiaryMobileNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-black/[0.06] bg-[color-mix(in_srgb,var(--gyokan-surface)_88%,transparent)] backdrop-blur-2xl lg:hidden">
      <div
        className="mx-auto flex max-w-lg justify-around px-1"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <Link
          href="/"
          className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-gray-400 transition-all duration-200"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" />
          </svg>
          <span className="text-[9px] font-medium">ホーム</span>
        </Link>
        <span className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[var(--gyokan-accent2)]">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 4h9l3 3v13a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
            <path d="M15 4v4h4M8 13h8M8 17h6" />
          </svg>
          <span className="text-[9px] font-medium">日記</span>
        </span>
      </div>
    </nav>
  );
}
