import type { Metadata, Viewport } from "next";
import {
  DM_Mono,
  Geist,
  Geist_Mono,
  Noto_Sans_JP,
  Noto_Serif_JP,
  Shippori_Mincho_B1,
  Zen_Maru_Gothic,
} from "next/font/google";
import { PRODUCTION_SITE_URL } from "@/lib/site-url";
import { DEFAULT_THEME_ID, GYOKAN_THEMES, GYOKAN_THEME_STORAGE_KEY } from "@/lib/gyokan/themes";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const notoSerifJP = Noto_Serif_JP({
  variable: "--font-noto-serif-jp",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const shipporiMincho = Shippori_Mincho_B1({
  variable: "--font-shippori-mincho",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const zenMaruGothic = Zen_Maru_Gothic({
  variable: "--font-zen-maru-gothic",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const fontVariables = [
  geistSans.variable,
  geistMono.variable,
  notoSansJP.variable,
  notoSerifJP.variable,
  shipporiMincho.variable,
  dmMono.variable,
  zenMaruGothic.variable,
].join(" ");

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? PRODUCTION_SITE_URL,
  ),
  title: "行間",
  description: "行間 — タスク・案件管理",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "行間",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

const allowedThemeBootstrapMap = Object.fromEntries(
  GYOKAN_THEMES.filter((t) => t.free).map((t) => [t.id, 1]),
);

const themeBootstrapScript = `
(function () {
  try {
    var key = ${JSON.stringify(GYOKAN_THEME_STORAGE_KEY)};
    var fallback = ${JSON.stringify(DEFAULT_THEME_ID)};
    var allowed = ${JSON.stringify(allowedThemeBootstrapMap)};
    var raw = localStorage.getItem(key) || fallback;
    var id = allowed[raw] ? raw : fallback;
    document.documentElement.dataset.theme = id;
  } catch (e) {
    document.documentElement.dataset.theme = ${JSON.stringify(DEFAULT_THEME_ID)};
  }
})();
`;

const chunkRecoveryScript = `
(function () {
  var reloaded = false;
  function maybeReload(reason) {
    if (reloaded) return;
    if (!reason || !/chunk|Loading chunk|dynamically imported module/i.test(String(reason))) return;
    reloaded = true;
    window.location.reload();
  }
  window.addEventListener("error", function (event) {
    maybeReload(event && event.message);
  });
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event && event.reason;
    maybeReload(reason && reason.message ? reason.message : reason);
  });
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${fontVariables} h-full antialiased`}
      data-theme={DEFAULT_THEME_ID}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <script dangerouslySetInnerHTML={{ __html: chunkRecoveryScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
