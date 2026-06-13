"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useGyokanTheme } from "@/components/gyokan-theme-provider";
import { isPaidThemeId, type GyokanThemeId } from "@/lib/gyokan/themes";

function SakuraPetal({
  className,
  color,
  style,
}: {
  className: string;
  color: string;
  style?: CSSProperties;
}) {
  return (
    <span className={className} style={style} aria-hidden>
      <svg viewBox="0 0 20 20" width="18" height="18" fill={color}>
        <ellipse cx="10" cy="6" rx="3.2" ry="5" />
        <ellipse cx="10" cy="6" rx="3.2" ry="5" transform="rotate(72 10 10)" />
        <ellipse cx="10" cy="6" rx="3.2" ry="5" transform="rotate(144 10 10)" />
        <ellipse cx="10" cy="6" rx="3.2" ry="5" transform="rotate(216 10 10)" />
        <ellipse cx="10" cy="6" rx="3.2" ry="5" transform="rotate(288 10 10)" />
      </svg>
    </span>
  );
}

function MapleLeaf({ className, color }: { className: string; color: string }) {
  return (
    <span className={className} aria-hidden>
      <svg viewBox="0 0 24 24" width="14" height="14" fill={color}>
        <path d="M12 2c1 3 3 4 5 4-1 2-3 3-5 3 1 2 2 4 2 7h-4c0-3 1-5 2-7-2 0-4-1-5-3 2 0 4-1 5-4z" />
      </svg>
    </span>
  );
}

function MarineDecoration() {
  return (
    <>
      <div className="theme-deco-marine__waves" aria-hidden>
        <svg viewBox="0 0 1200 80" preserveAspectRatio="none">
          <path d="M0 40 Q150 10 300 40 T600 40 T900 40 T1200 40 V80 H0 Z" fill="rgba(46,143,163,0.18)" />
          <path d="M0 52 Q150 28 300 52 T600 52 T900 52 T1200 52 V80 H0 Z" fill="rgba(46,143,163,0.12)" />
          <path d="M0 62 Q150 44 300 62 T600 62 T900 62 T1200 62 V80 H0 Z" fill="rgba(46,143,163,0.08)" />
        </svg>
      </div>
      <div className="theme-deco-marine__starfish" aria-hidden>
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l2.2 6.8H21l-5.5 4 2.1 6.7L12 16.8 6.4 19.5l2.1-6.7L3 8.8h6.8z" />
        </svg>
      </div>
    </>
  );
}

function SakuraDecoration() {
  const petals = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        id: i,
        left: `${6 + ((i * 19) % 88)}%`,
        color: i % 3 === 0 ? "#f0b4c8" : i % 3 === 1 ? "#e8a0b8" : "#f5c6d6",
        duration: 12 + (i % 5) * 2,
        delay: i * 1.4,
        variant: i % 2 === 0 ? "a" : "b",
      })),
    [],
  );

  return (
    <>
      {petals.map((p) => (
        <SakuraPetal
          key={p.id}
          className={`theme-deco-fall theme-deco-fall--sakura-${p.variant}`}
          color={p.color}
          style={{
            left: p.left,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </>
  );
}

function SunsetDecoration() {
  return (
    <>
      <div className="theme-deco-sunset__band" aria-hidden />
      <svg className="theme-deco-sunset__bird theme-deco-sunset__bird--a" viewBox="0 0 24 8" aria-hidden>
        <path d="M2 6 Q6 2 12 6 Q18 2 22 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
      <svg className="theme-deco-sunset__bird theme-deco-sunset__bird--b" viewBox="0 0 24 8" aria-hidden>
        <path d="M2 6 Q6 2 12 6 Q18 2 22 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
    </>
  );
}

function MomijiDecoration() {
  return (
    <>
      <MapleLeaf className="theme-deco-fall theme-deco-fall--momiji-1" color="#c9683f" />
      <MapleLeaf className="theme-deco-fall theme-deco-fall--momiji-2" color="#a8432a" />
      <MapleLeaf className="theme-deco-fall theme-deco-fall--momiji-3" color="#d4883a" />
    </>
  );
}

function YukigeshikiDecoration() {
  const flakes = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        id: i,
        left: `${8 + i * 12 + (i % 3) * 4}%`,
        size: 2 + (i % 3),
        duration: 16 + (i % 4) * 2,
        delay: i * 2.2,
        drift: `${-8 + (i % 5) * 4}px`,
        opacity: 0.3 + (i % 3) * 0.1,
      })),
    [],
  );

  return (
    <>
      {flakes.map((f) => (
        <span
          key={f.id}
          className="theme-deco-snow"
          style={{
            left: f.left,
            width: f.size,
            height: f.size,
            animationDuration: `${f.duration}s`,
            animationDelay: `${f.delay}s`,
            ["--snow-drift" as string]: f.drift,
            ["--snow-opacity" as string]: String(f.opacity),
          }}
          aria-hidden
        />
      ))}
    </>
  );
}

function KamiDecoration() {
  return (
    <>
      <div className="theme-deco-kami__texture" aria-hidden />
      <div className="theme-deco-kami__vignette" aria-hidden />
    </>
  );
}

function YofukashiDecoration() {
  const stars = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        top: `${6 + ((i * 17) % 78)}%`,
        left: `${4 + ((i * 23) % 90)}%`,
        duration: 2 + (i % 4),
        delay: (i % 5) * 0.7,
      })),
    [],
  );

  return (
    <>
      {stars.map((s) => (
        <span
          key={s.id}
          className="theme-deco-star"
          style={{
            top: s.top,
            left: s.left,
            animationDuration: `${s.duration}s`,
            animationDelay: `${s.delay}s`,
          }}
          aria-hidden
        />
      ))}
      <div className="theme-deco-yofukashi__moon" aria-hidden />
    </>
  );
}

function FurikaeriDecoration() {
  return (
    <>
      <div className="theme-deco-furikaeri__vignette" aria-hidden />
      <div className="theme-deco-furikaeri__grain" aria-hidden />
    </>
  );
}

const DECORATION_BY_THEME: Partial<Record<GyokanThemeId, () => ReactNode>> = {
  marine: MarineDecoration,
  sakura: SakuraDecoration,
  sunset: SunsetDecoration,
  momiji: MomijiDecoration,
  yukigeshiki: YukigeshikiDecoration,
  kami: KamiDecoration,
  yofukashi: YofukashiDecoration,
  furikaeri: FurikaeriDecoration,
};

export function ThemeDecorationLayer() {
  const { themeId } = useGyokanTheme();

  if (!isPaidThemeId(themeId)) return null;

  const Deco = DECORATION_BY_THEME[themeId];
  if (!Deco) return null;

  return (
    <div className="theme-decoration" aria-hidden>
      <Deco />
    </div>
  );
}
