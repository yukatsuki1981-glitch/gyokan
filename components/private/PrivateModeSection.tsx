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
    // On mobile this must NOT be h-full + overflow-hidden: the parent wrapper
    // in page.tsx is the scroll container (flex-1 + min-h-0 + overflow-y-auto),
    // and pinning this box to exactly the parent's height while hiding its
    // overflow would clip tall content instead of letting the parent scroll it,
    // which is what happens once the account actually has tasks in it.
    // min-h-full keeps the background filling the area when content is short.
    //
    // On desktop (lg+) this is no longer a small floating preview card — it
    // now fills the same center column tasks mode's own content uses (left
    // project sidebar and right calendar/memo panel are untouched siblings),
    // so the old fixed lg:h-[640px] card treatment (rounded/border/shadow)
    // is dropped in favor of just filling the available height plainly.
    <div className="flex min-h-full flex-col bg-[#fafafa] lg:h-full lg:bg-transparent">
      {children}
    </div>
  );
}
