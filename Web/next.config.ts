import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.212.215"],
  async rewrites() {
    return [
      {
        source: "/api/proxy/bcdn/:path*",
        destination: "https://bcdn.hakunaymatata.com/:path*",
      },
      {
        source: "/api/proxy/aoneroom/:path*",
        destination: "https://api6.aoneroom.com/:path*",
      },
    ];
  },
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
