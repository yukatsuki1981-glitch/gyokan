import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev assets to load when accessing from a phone on the same LAN (e.g. http://192.168.x.x:3000).
  allowedDevOrigins: [
    "192.168.*.*",
    "10.*.*.*",
    "172.*.*.*",
    "*.local",
  ],
};

export default nextConfig;
