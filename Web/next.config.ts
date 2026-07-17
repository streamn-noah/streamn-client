import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.212.215"],
  turbopack: {
    root: process.cwd(),
  },
  images: {
    unoptimized: true,
    qualities: [25, 38, 50, 60, 75, 85, 100],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
      },
    ],
  },
};

export default nextConfig;
