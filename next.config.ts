import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

// Version / build details for the settings screen (lib/gyokan/build-info.ts).
// Fixed into the bundle at build time.
const packageVersion = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "";
  } catch {
    return "";
  }
})();

const nextConfig: NextConfig = {
  // Allow dev assets to load when accessing from a phone on the same LAN (e.g. http://192.168.x.x:3000).
  allowedDevOrigins: [
    "192.168.*.*",
    "10.*.*.*",
    "172.*.*.*",
    "*.local",
  ],
  env: {
    GYOKAN_APP_VERSION: packageVersion,
    // Set by Vercel during its builds; empty for local builds.
    GYOKAN_BUILD_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    GYOKAN_BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
