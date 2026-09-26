"use client";

import { useEffect } from "react";
import { Zen_Maru_Gothic } from "next/font/google";

// Zen Maru Gothic is only used by the marine and sakura themes (see
// app/gyokan-themes.css). Mounting this component adds its font-variable
// class to <html> so descendants can resolve --font-zen-maru-gothic; it is
// dynamically imported so its ~460KB of CJK @font-face CSS is only fetched
// by visitors actually using one of those two themes.
const zenMaruGothic = Zen_Maru_Gothic({
  variable: "--font-zen-maru-gothic",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  preload: false,
});

export default function ZenMaruGothicLoader() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(zenMaruGothic.variable);
    return () => {
      root.classList.remove(zenMaruGothic.variable);
    };
  }, []);

  return null;
}
