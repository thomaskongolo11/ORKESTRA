import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@orkestra/ai",
    "@orkestra/database",
    "@orkestra/shared",
    "@orkestra/validation",
  ],
};

export default nextConfig;
