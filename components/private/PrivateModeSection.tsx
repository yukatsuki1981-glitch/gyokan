"use client";

/**
 * Private-mode content area — rebuilt from scratch (Step 1: shell only).
 *
 * The header and footer are NOT rendered here; they live in app/page.tsx
 * as the same shared elements used by tasks mode (the header <header> block,
 * and the shared MobileBarShell footer). This component only fills the
 * space between them. Its parent wrapper in page.tsx already provides
 * min-h-0 + flex-1 on mobile, so this component just needs to accept that
 * space with h-full — no height math of its own.
 *
 * Step 1 goal: confirm the header and footer sit at the exact same
 * position/height as tasks mode with this area empty. The calendar goes
 * in next (Step 2), then its features (Step 3).
 */
export function PrivateModeSection() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#fafafa] lg:h-[640px] lg:rounded-2xl lg:border lg:border-black/[0.06] lg:bg-white lg:shadow-sm">
      <div className="flex flex-1 items-center justify-center text-[12px] text-gray-300">
        (Step 1: カレンダーは未実装)
      </div>
    </div>
  );
}
