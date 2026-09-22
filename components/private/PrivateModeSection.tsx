"use client";

import type { ReactNode } from "react";

/**
 * Private-mode content area shell.
 *
 * Rebuild in progress: this step intentionally renders whatever tasks mode
 * would render (passed in as children from app/page.tsx) with zero
 * filtering or private-specific UI, to confirm the shared header/footer
 * shell holds up with real data before private-only content (scope
 * filtering, the private calendar) is reintroduced.
 *
 * The header and footer are NOT rendered here; they live in app/page.tsx
 * as the same shared elements tasks mode uses. This component only fills
 * the space between them — its parent wrapper already provides
 * min-h-0 + flex-1 on mobile, so this just accepts that space with h-full.
 */
export function PrivateModeSection({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#fafafa] lg:h-[640px] lg:rounded-2xl lg:border lg:border-black/[0.06] lg:bg-white lg:shadow-sm">
      {children}
    </div>
  );
}
