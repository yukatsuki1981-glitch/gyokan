"use client";

import { useEffect, useState } from "react";

export const RESEND_COOLDOWN_SECONDS = 60;

// Kept outside React so the wait survives the button unmounting, such as when
// the login form clears its error and then shows it again.
const cooldownUntil = new Map<string, number>();

export function startCooldown(key: string) {
  cooldownUntil.set(key, Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
}

/** Seconds left before `key` may be used again, updating every second. */
export function useCooldown(key: string) {
  const [now, setNow] = useState(() => Date.now());
  const until = cooldownUntil.get(key) ?? 0;

  useEffect(() => {
    if (until <= Date.now()) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [until]);

  return {
    remaining: Math.max(0, Math.ceil((until - now) / 1000)),
    start: () => {
      startCooldown(key);
      setNow(Date.now());
    },
    cancel: () => {
      cooldownUntil.delete(key);
      setNow(Date.now());
    },
  };
}
