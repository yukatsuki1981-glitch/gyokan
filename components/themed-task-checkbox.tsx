"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import { useGyokanTheme } from "@/components/gyokan-theme-provider";
import { isPaidThemeId, type GyokanThemeId } from "@/lib/gyokan/themes";

type Size = "sm" | "md";

function DefaultCheckIcon({ size }: { size: Size }) {
  const cls = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
      <path d="M5 12l4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ThemeCheckGlyph({ themeId, done, size }: { themeId: GyokanThemeId; done: boolean; size: Size }) {
  const dim = size === "sm" ? 14 : 16;
  if (!done) return null;

  switch (themeId) {
    case "marine":
      return (
        <svg width={dim} height={dim} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" aria-hidden>
          <path d="M4 14c4-6 12-6 16 0" strokeLinecap="round" />
        </svg>
      );
    case "sakura":
      return (
        <svg width={dim} height={dim} viewBox="0 0 20 20" fill="#fff" aria-hidden>
          <ellipse cx="10" cy="7" rx="3" ry="4.5" />
        </svg>
      );
    case "sunset":
      return <DefaultCheckIcon size={size} />;
    case "momiji":
      return (
        <svg width={dim} height={dim} viewBox="0 0 24 24" fill="#fff" aria-hidden>
          <path d="M12 3c1 2.5 2.5 3.5 4.5 3.5-1 1.5-2.5 2.5-4.5 2.5 1 1.5 1.5 3 1.5 5h-3c0-2 .5-3.5 1.5-5-2 0-3.5-1-4.5-2.5 2 0 3.5-1 4.5-3.5z" />
        </svg>
      );
    case "yukigeshiki":
      return (
        <svg width={dim} height={dim} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" aria-hidden>
          <path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" />
        </svg>
      );
    case "kami":
      return (
        <svg width={dim} height={dim} viewBox="0 0 24 24" fill="none" stroke="#4a3d2a" strokeWidth="2.2" aria-hidden>
          <path className="themed-task-check__ink" d="M5 12l4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "yofukashi":
      return (
        <svg width={dim} height={dim} viewBox="0 0 24 24" fill="#fff" aria-hidden>
          <path d="M12 2l1.8 5.5H19l-4.5 3.3 1.7 5.5L12 14.8 7.8 16.3l1.7-5.5L5 7.5h5.2z" />
        </svg>
      );
    case "furikaeri":
      return <DefaultCheckIcon size={size} />;
    default:
      return <DefaultCheckIcon size={size} />;
  }
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  done: boolean;
  size?: Size;
};

export function ThemedTaskCheckbox({ done, size = "md", className = "", ...props }: Props) {
  const { themeId } = useGyokanTheme();
  const dim = size === "sm" ? "h-[18px] w-[18px]" : "h-[20px] w-[20px]";
  const [animPulse, setAnimPulse] = useState(false);
  const prevDone = useRef(done);

  useEffect(() => {
    if (done && !prevDone.current && isPaidThemeId(themeId)) {
      setAnimPulse(true);
      const timer = window.setTimeout(() => setAnimPulse(false), 500);
      return () => window.clearTimeout(timer);
    }
    prevDone.current = done;
  }, [done, themeId]);

  if (!isPaidThemeId(themeId)) {
    return (
      <button
        type="button"
        {...props}
        className={`flex ${dim} shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
          done
            ? "border-[var(--gyokan-accent2)] bg-[var(--gyokan-accent2)] text-white"
            : "border-gray-300 bg-white hover:border-[var(--gyokan-accent2)]"
        } ${className}`}
      >
        {done && <DefaultCheckIcon size={size} />}
      </button>
    );
  }

  const paidDoneBg =
    themeId === "kami"
      ? "bg-[#f7f2e6]"
      : themeId === "sunset" || themeId === "furikaeri"
        ? ""
        : "bg-[var(--gyokan-accent2)]";

  return (
    <button
      type="button"
      {...props}
      data-anim={animPulse ? "1" : undefined}
      className={`themed-task-check themed-task-check--${themeId} ${dim} shrink-0 ${done ? `is-done ${paidDoneBg}` : ""} ${className}`}
    >
      <span className="themed-task-check__burst" aria-hidden />
      <span className="themed-task-check__petal-pop" aria-hidden>
        <svg viewBox="0 0 20 20" width="10" height="10" fill="#f0b4c8">
          <ellipse cx="10" cy="7" rx="3" ry="4.5" />
        </svg>
      </span>
      <span className="themed-task-check__leaf-spin" aria-hidden>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="#c9683f">
          <path d="M12 3c1 2.5 2.5 3.5 4.5 3.5-1 1.5-2.5 2.5-4.5 2.5 1 1.5 1.5 3 1.5 5h-3c0-2 .5-3.5 1.5-5-2 0-3.5-1-4.5-2.5 2 0 3.5-1 4.5-3.5z" />
        </svg>
      </span>
      <span className="themed-task-check__glyph">
        <ThemeCheckGlyph themeId={themeId} done={done} size={size} />
      </span>
    </button>
  );
}
