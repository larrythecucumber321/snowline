import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["geotiff"],
  turbopack: { root: process.cwd() },
};

export default nextConfig;
