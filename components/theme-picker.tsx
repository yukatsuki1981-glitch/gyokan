"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  GYOKAN_THEMES,
  getThemeById,
  isThemeSelectable,
  type GyokanThemeId,
} from "@/lib/gyokan/themes";
import { useGyokanTheme } from "@/components/gyokan-theme-provider";

function ThemeSwatch({ themeId }: { themeId: GyokanThemeId }) {
  const theme = getThemeById(themeId);
  return (
    <span className="flex h-8 w-8 shrink-0 overflow-hidden rounded-lg ring-1 ring-black/[0.08]">
      <span className="h-full w-1/2" style={{ backgroundColor: theme.colors.bg }} />
      <span className="h-full w-1/2" style={{ backgroundColor: theme.colors.accent2 }} />
    </span>
  );
}

function LockIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 10V8a5 5 0 0 1 10 0v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect x="5" y="10" width="14" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12.5 9.5 17 19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ThemePickerOverlay({
  onClose,
  children,
  title,
}: {
  onClose: () => void;
  children: ReactNode;
  title: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
        aria-label="閉じる"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-[var(--gyokan-surface)] shadow-[0_24px_80px_rgba(0,0,0,0.18)] ring-1 ring-[var(--gyokan-border)] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--gyokan-border)] px-4 py-3">
          <h2 className="gyokan-heading text-[17px] font-semibold text-[var(--gyokan-text)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="rounded-xl p-2 text-[var(--gyokan-text2)] transition-colors hover:bg-[var(--gyokan-bg2)]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function ThemePickerModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { themeId, setThemeId, isPaidMember } = useGyokanTheme();
  const [paidNotice, setPaidNotice] = useState<GyokanThemeId | null>(null);

  if (!open) return null;

  const paidTheme = paidNotice ? getThemeById(paidNotice) : null;

  return (
    <>
      <ThemePickerOverlay onClose={onClose} title="テーマ">
        <p className="mb-4 text-[13px] leading-relaxed text-[var(--gyokan-text2)]">
          {isPaidMember
            ? "有料会員: 全テーマを選択できます。"
            : "無料テーマはすぐに切り替えられます。有料テーマは有料会員プランで利用できます。"}
        </p>
        <ul className="space-y-2">
          {GYOKAN_THEMES.map((theme) => {
            const selected = theme.id === themeId;
            const locked = !isThemeSelectable(theme, isPaidMember);
            return (
              <li key={theme.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (locked) {
                      setPaidNotice(theme.id);
                      return;
                    }
                    setThemeId(theme.id);
                  }}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors ${
                    selected
                      ? "border-[var(--gyokan-accent2)] bg-[var(--gyokan-accent-lt)]"
                      : "border-[var(--gyokan-border)] bg-[var(--gyokan-bg)] hover:bg-[var(--gyokan-bg2)]"
                  }`}
                >
                  <ThemeSwatch themeId={theme.id} />
                  <div className="min-w-0 flex-1">
                    <p className="gyokan-heading truncate text-[14px] font-semibold text-[var(--gyokan-text)]">
                      {theme.name}
                    </p>
                    <p className="text-[11px] text-[var(--gyokan-text2)]">
                      {theme.free ? "無料" : "有料"}
                    </p>
                  </div>
                  {locked ? (
                    <span className="shrink-0 text-[var(--gyokan-text2)]" aria-label="有料テーマ">
                      <LockIcon />
                    </span>
                  ) : selected ? (
                    <span className="shrink-0 text-[var(--gyokan-accent2)]" aria-label="選択中">
                      <CheckIcon />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </ThemePickerOverlay>

      {paidTheme && (
        <ThemePickerOverlay onClose={() => setPaidNotice(null)} title="有料テーマ">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--gyokan-accent-lt)] text-[var(--gyokan-accent2)]">
              <LockIcon className="h-7 w-7" />
            </div>
            <p className="gyokan-heading mb-2 text-[17px] font-semibold text-[var(--gyokan-text)]">
              {paidTheme.name}
            </p>
            <p className="mb-6 text-[13px] leading-relaxed text-[var(--gyokan-text2)]">
              このテーマは有料会員プランでご利用いただけます。
            </p>
            <button
              type="button"
              onClick={() => setPaidNotice(null)}
              className="w-full rounded-xl bg-[var(--gyokan-accent2)] px-4 py-2.5 text-[14px] font-medium text-white"
            >
              閉じる
            </button>
          </div>
        </ThemePickerOverlay>
      )}
    </>
  );
}
