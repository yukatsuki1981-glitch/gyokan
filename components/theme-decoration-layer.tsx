"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useGyokanTheme } from "@/components/gyokan-theme-provider";
import { isPaidThemeId, type GyokanThemeId } from "@/lib/gyokan/themes";

type ScatterItem = {
  id: number;
  top: string;
  left: string;
  rotate: number;
  opacity: number;
  size: number;
};

function scatter(count: number, seed: number): ScatterItem[] {
  return Array.from({ length: count }, (_, i) => {
    const n = (i * 17 + seed * 31) % 100;
    const m = (i * 23 + seed * 13) % 100;
    return {
      id: i,
      top: `${4 + (n * 0.86) % 88}%`,
      left: `${3 + (m * 0.91) % 92}%`,
      rotate: (i * 47 + seed * 11) % 360,
      opacity: 0.12 + ((i + seed) % 5) * 0.04,
      size: 6 + ((i + seed) % 4) * 3,
    };
  });
}

function StaticPetal({ color, style }: { color: string; style: CSSProperties }) {
  return (
    <span className="theme-deco-scatter" style={style} aria-hidden>
      <svg viewBox="0 0 20 20" width="100%" height="100%" fill={color}>
        <ellipse cx="10" cy="6.5" rx="3" ry="4.8" />
        <ellipse cx="10" cy="6.5" rx="3" ry="4.8" transform="rotate(72 10 10)" />
        <ellipse cx="10" cy="6.5" rx="3" ry="4.8" transform="rotate(144 10 10)" />
        <ellipse cx="10" cy="6.5" rx="3" ry="4.8" transform="rotate(216 10 10)" />
        <ellipse cx="10" cy="6.5" rx="3" ry="4.8" transform="rotate(288 10 10)" />
      </svg>
    </span>
  );
}

function StaticLeaf({ color, style }: { color: string; style: CSSProperties }) {
  return (
    <span className="theme-deco-scatter" style={style} aria-hidden>
      <svg viewBox="0 0 24 24" width="100%" height="100%" fill={color}>
        <path d="M12 2c1 3 3 4 5 4-1 2-3 3-5 3 1 2 2 4 2 7h-4c0-3 1-5 2-7-2 0-4-1-5-3 2 0 4-1 5-4z" />
      </svg>
    </span>
  );
}

function MarineDecoration() {
  return (
    <>
      <div className="theme-deco-marine__wash" aria-hidden />
      <svg className="theme-deco-marine__cloud theme-deco-marine__cloud--tl" viewBox="0 0 120 48" aria-hidden>
        <ellipse cx="36" cy="30" rx="28" ry="14" fill="rgba(255,255,255,0.45)" />
        <ellipse cx="58" cy="24" rx="22" ry="12" fill="rgba(255,255,255,0.38)" />
        <ellipse cx="78" cy="32" rx="26" ry="13" fill="rgba(255,255,255,0.35)" />
      </svg>
      <svg className="theme-deco-marine__cloud theme-deco-marine__cloud--tr" viewBox="0 0 120 48" aria-hidden>
        <ellipse cx="42" cy="28" rx="24" ry="12" fill="rgba(255,255,255,0.4)" />
        <ellipse cx="68" cy="22" rx="20" ry="11" fill="rgba(255,255,255,0.34)" />
      </svg>
      <div className="theme-deco-marine__waves" aria-hidden>
        <svg viewBox="0 0 1200 120" preserveAspectRatio="none">
          <defs>
            <linearGradient id="marine-wave-a" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(125,211,224,0.55)" />
              <stop offset="100%" stopColor="rgba(46,143,163,0.35)" />
            </linearGradient>
            <linearGradient id="marine-wave-b" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(46,143,163,0.42)" />
              <stop offset="100%" stopColor="rgba(30,108,124,0.28)" />
            </linearGradient>
          </defs>
          <path d="M0 52 Q200 18 400 52 T800 52 T1200 52 V120 H0 Z" fill="url(#marine-wave-a)" />
          <path d="M0 72 Q180 44 380 72 T780 72 T1200 72 V120 H0 Z" fill="url(#marine-wave-b)" />
          <path d="M0 88 Q160 68 360 88 T760 88 T1200 88 V120 H0 Z" fill="rgba(46,143,163,0.18)" />
        </svg>
      </div>
      <svg className="theme-deco-marine__icon theme-deco-marine__shell" viewBox="0 0 32 32" aria-hidden>
        <path d="M16 4c6 4 10 8 10 14a10 10 0 0 1-20 0c0-6 4-10 10-14z" fill="rgba(46,143,163,0.28)" />
        <path d="M16 8v16M12 12c2 2 4 2 4 0M20 12c-2 2-4 2-4 0" stroke="rgba(46,143,163,0.22)" fill="none" />
      </svg>
      <svg className="theme-deco-marine__icon theme-deco-marine__starfish" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 2l2.2 6.8H21l-5.5 4 2.1 6.7L12 16.8 6.4 19.5l2.1-6.7L3 8.8h6.8z" fill="rgba(46,143,163,0.3)" />
      </svg>
      <svg className="theme-deco-marine__icon theme-deco-marine__yacht" viewBox="0 0 40 32" aria-hidden>
        <path d="M6 22h28l-4-10H10l-4 10z" fill="rgba(46,143,163,0.22)" />
        <path d="M20 6v12M20 6l6 4M20 6L14 10" stroke="rgba(46,143,163,0.28)" fill="none" strokeWidth="1.5" />
        <path d="M4 24h32" stroke="rgba(46,143,163,0.2)" strokeWidth="1.2" />
      </svg>
    </>
  );
}

function SakuraBranch({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 160 120" aria-hidden>
      <path d="M8 108 C40 88, 58 62, 72 38" stroke="rgba(180,120,130,0.35)" strokeWidth="2.5" fill="none" />
      <circle cx="72" cy="38" r="9" fill="rgba(240,160,180,0.42)" />
      <circle cx="64" cy="32" r="7" fill="rgba(245,180,195,0.38)" />
      <circle cx="80" cy="34" r="6.5" fill="rgba(232,150,170,0.36)" />
      <circle cx="52" cy="58" r="8" fill="rgba(240,165,185,0.34)" />
      <circle cx="44" cy="52" r="5.5" fill="rgba(248,190,205,0.32)" />
      <circle cx="88" cy="48" r="7" fill="rgba(235,155,175,0.3)" />
    </svg>
  );
}

function SakuraDecoration() {
  const petals = useMemo(() => scatter(14, 2), []);
  const colors = ["#f0b4c8", "#e8a0b8", "#f5c6d6", "#efb8cc"];

  return (
    <>
      <div className="theme-deco-sakura__wash" aria-hidden />
      <SakuraBranch className="theme-deco-sakura__branch theme-deco-sakura__branch--tl" />
      <SakuraBranch className="theme-deco-sakura__branch theme-deco-sakura__branch--tr" />
      <SakuraBranch className="theme-deco-sakura__branch theme-deco-sakura__branch--bl" />
      <SakuraBranch className="theme-deco-sakura__branch theme-deco-sakura__branch--br" />
      {petals.map((p) => (
        <StaticPetal
          key={p.id}
          color={colors[p.id % colors.length]!}
          style={{
            top: p.top,
            left: p.left,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </>
  );
}

function SunsetDecoration() {
  return (
    <>
      <div className="theme-deco-sunset__wash" aria-hidden />
      <div className="theme-deco-sunset__band" aria-hidden />
      <svg className="theme-deco-sunset__horizon" viewBox="0 0 800 120" preserveAspectRatio="none" aria-hidden>
        <path d="M0 80 L120 52 220 68 340 40 460 58 580 36 700 54 800 44 V120 H0 Z" fill="rgba(45,35,50,0.28)" />
        <path d="M0 96 L80 78 180 88 300 72 420 84 560 70 680 82 800 74 V120 H0 Z" fill="rgba(35,28,42,0.22)" />
        <rect x="40" y="62" width="8" height="18" fill="rgba(40,32,48,0.2)" />
        <rect x="52" y="56" width="6" height="24" fill="rgba(40,32,48,0.18)" />
        <rect x="360" y="58" width="10" height="22" fill="rgba(40,32,48,0.2)" />
        <rect x="520" y="54" width="7" height="26" fill="rgba(40,32,48,0.19)" />
      </svg>
      <svg className="theme-deco-sunset__bird theme-deco-sunset__bird--a" viewBox="0 0 24 8" aria-hidden>
        <path d="M2 6 Q6 2 12 6 Q18 2 22 6" stroke="rgba(90,55,45,0.35)" strokeWidth="1.5" fill="none" />
      </svg>
      <svg className="theme-deco-sunset__bird theme-deco-sunset__bird--b" viewBox="0 0 24 8" aria-hidden>
        <path d="M2 6 Q6 2 12 6 Q18 2 22 6" stroke="rgba(90,55,45,0.3)" strokeWidth="1.5" fill="none" />
      </svg>
      <svg className="theme-deco-sunset__bird theme-deco-sunset__bird--c" viewBox="0 0 24 8" aria-hidden>
        <path d="M2 6 Q6 2 12 6 Q18 2 22 6" stroke="rgba(90,55,45,0.28)" strokeWidth="1.5" fill="none" />
      </svg>
    </>
  );
}

function MomijiBranch({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 140 110" aria-hidden>
      <path d="M10 98 C38 78, 52 54, 68 28" stroke="rgba(120,70,40,0.38)" strokeWidth="2.2" fill="none" />
      <path d="M68 28c-1 3 1 6 4 7-2 1-4 3-4 6h-3c0-2 1-4 2-5-2 0-3-1-4-3 2 0 3-1 5-5z" fill="rgba(201,104,63,0.45)" />
      <path d="M48 52c-1 2 0 4 3 5-1 1-2 2-2 4h-2c0-1 1-2 1-3-1 0-2-1-2-2 1 0 2-1 3-4z" fill="rgba(212,136,58,0.4)" transform="scale(0.85) translate(8 8)" />
      <path d="M82 44c-1 2 0 4 3 5-1 1-2 2-2 4h-2c0-1 1-2 1-3-1 0-2-1-2-2 1 0 2-1 3-4z" fill="rgba(168,67,42,0.42)" transform="scale(0.9) translate(28 4)" />
    </svg>
  );
}

function MomijiDecoration() {
  const leaves = useMemo(() => scatter(12, 5), []);
  const colors = ["#c9683f", "#a8432a", "#d4883a", "#b85a32"];

  return (
    <>
      <div className="theme-deco-momiji__wash" aria-hidden />
      <MomijiBranch className="theme-deco-momiji__branch theme-deco-momiji__branch--tl" />
      <MomijiBranch className="theme-deco-momiji__branch theme-deco-momiji__branch--tr" />
      <MomijiBranch className="theme-deco-momiji__branch theme-deco-momiji__branch--bl" />
      <MomijiBranch className="theme-deco-momiji__branch theme-deco-momiji__branch--br" />
      {leaves.map((l) => (
        <StaticLeaf
          key={l.id}
          color={colors[l.id % colors.length]!}
          style={{
            top: l.top,
            left: l.left,
            width: l.size + 2,
            height: l.size + 2,
            opacity: l.opacity + 0.08,
            transform: `rotate(${l.rotate}deg)`,
          }}
        />
      ))}
    </>
  );
}

function YukigeshikiDecoration() {
  const flakes = useMemo(() => scatter(28, 7), []);

  return (
    <>
      <div className="theme-deco-yuki__mist" aria-hidden />
      <svg className="theme-deco-yuki__mountains" viewBox="0 0 800 100" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="yuki-mtn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(220,235,248,0.7)" />
            <stop offset="100%" stopColor="rgba(180,205,225,0.35)" />
          </linearGradient>
        </defs>
        <path d="M0 70 L140 20 260 58 400 12 540 48 680 18 800 52 V100 H0 Z" fill="url(#yuki-mtn)" />
        <path d="M0 82 L100 58 220 72 380 50 520 68 660 54 800 70 V100 H0 Z" fill="rgba(200,220,240,0.28)" />
      </svg>
      {flakes.map((f) => (
        <span
          key={f.id}
          className={`theme-deco-yuki__flake ${f.id % 3 === 0 ? "theme-deco-yuki__flake--crystal" : ""}`}
          style={{
            top: f.top,
            left: f.left,
            width: f.size * (f.id % 3 === 0 ? 1.4 : 1),
            height: f.size * (f.id % 3 === 0 ? 1.4 : 1),
            opacity: f.opacity + 0.1,
            transform: `rotate(${f.rotate}deg)`,
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
      <div className="theme-deco-kami__wash" aria-hidden />
      <div className="theme-deco-kami__texture" aria-hidden />
      <svg className="theme-deco-kami__pattern theme-deco-kami__pattern--tl" viewBox="0 0 80 80" aria-hidden>
        <path d="M0 20h20V0M40 20h20V0M0 60h20V40M40 60h20V40" stroke="rgba(74,61,42,0.14)" strokeWidth="1.2" fill="none" />
      </svg>
      <svg className="theme-deco-kami__pattern theme-deco-kami__pattern--br" viewBox="0 0 80 80" aria-hidden>
        <path d="M40 0 L80 40 L40 80 L0 40 Z" stroke="rgba(74,61,42,0.12)" fill="none" strokeWidth="1" />
        <path d="M40 12 L68 40 L40 68 L12 40 Z" stroke="rgba(74,61,42,0.1)" fill="none" strokeWidth="0.8" />
      </svg>
      <svg className="theme-deco-kami__brush theme-deco-kami__brush--tr" viewBox="0 0 64 64" aria-hidden>
        <path d="M8 48 Q24 28 40 20 Q48 16 52 12" stroke="rgba(58,48,36,0.2)" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M44 18 Q50 24 54 34" stroke="rgba(58,48,36,0.15)" strokeWidth="2" fill="none" />
      </svg>
      <svg className="theme-deco-kami__brush theme-deco-kami__brush--bl" viewBox="0 0 64 64" aria-hidden>
        <path d="M56 48 Q40 30 24 22 Q16 18 10 14" stroke="rgba(58,48,36,0.18)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </svg>
    </>
  );
}

function YofukashiDecoration() {
  const stars = useMemo(() => scatter(36, 9), []);

  return (
    <>
      <div className="theme-deco-yofukashi__wash" aria-hidden />
      {stars.map((s) => (
        <span
          key={s.id}
          className="theme-deco-yofukashi__star"
          style={{
            top: s.top,
            left: s.left,
            width: s.id % 5 === 0 ? 3 : 2,
            height: s.id % 5 === 0 ? 3 : 2,
            opacity: 0.35 + (s.id % 4) * 0.12,
          }}
          aria-hidden
        />
      ))}
      <div className="theme-deco-yofukashi__moon" aria-hidden />
      <svg className="theme-deco-yofukashi__buildings theme-deco-yofukashi__buildings--br" viewBox="0 0 120 80" aria-hidden>
        <rect x="8" y="36" width="18" height="44" fill="rgba(20,24,48,0.35)" />
        <rect x="30" y="22" width="22" height="58" fill="rgba(24,28,52,0.38)" />
        <rect x="56" y="42" width="16" height="38" fill="rgba(18,22,44,0.32)" />
        <rect x="76" y="28" width="20" height="52" fill="rgba(22,26,50,0.36)" />
        <rect x="100" y="46" width="14" height="34" fill="rgba(16,20,42,0.3)" />
      </svg>
      <svg className="theme-deco-yofukashi__buildings theme-deco-yofukashi__buildings--bl" viewBox="0 0 90 60" aria-hidden>
        <rect x="6" y="28" width="14" height="32" fill="rgba(20,24,48,0.28)" />
        <rect x="24" y="18" width="18" height="42" fill="rgba(24,28,52,0.3)" />
        <rect x="46" y="32" width="12" height="28" fill="rgba(18,22,44,0.26)" />
        <rect x="62" y="22" width="16" height="38" fill="rgba(22,26,50,0.29)" />
      </svg>
    </>
  );
}

function FurikaeriDecoration() {
  return (
    <>
      <div className="theme-deco-furikaeri__vignette" aria-hidden />
      <div className="theme-deco-furikaeri__grain" aria-hidden />
      <svg className="theme-deco-furikaeri__frame theme-deco-furikaeri__frame--tl" viewBox="0 0 72 88" aria-hidden>
        <rect x="4" y="4" width="64" height="80" rx="2" fill="rgba(248,240,220,0.12)" stroke="rgba(120,96,64,0.28)" strokeWidth="2" />
        <rect x="10" y="10" width="52" height="62" fill="rgba(200,180,150,0.08)" />
      </svg>
      <svg className="theme-deco-furikaeri__frame theme-deco-furikaeri__frame--br" viewBox="0 0 80 96" aria-hidden>
        <rect x="6" y="14" width="68" height="76" rx="3" fill="rgba(248,240,220,0.1)" stroke="rgba(120,96,64,0.25)" strokeWidth="2" />
        <rect x="14" y="22" width="52" height="56" fill="rgba(180,160,130,0.07)" />
        <rect x="0" y="0" width="80" height="18" fill="rgba(248,240,220,0.14)" />
      </svg>
      <svg className="theme-deco-furikaeri__frame theme-deco-furikaeri__frame--tr" viewBox="0 0 64 76" aria-hidden>
        <rect x="3" y="3" width="58" height="70" rx="2" fill="none" stroke="rgba(120,96,64,0.22)" strokeWidth="1.8" />
        <rect x="8" y="8" width="48" height="54" fill="rgba(210,190,160,0.06)" />
      </svg>
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
    <div className={`theme-decoration theme-decoration--${themeId}`} aria-hidden>
      <Deco />
    </div>
  );
}
