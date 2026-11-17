import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pas d'indicateur Next.js superposé aux pages en développement.
  devIndicators: false,
  transpilePackages: [
    "@orkestra/ai",
    "@orkestra/database",
    "@orkestra/shared",
    "@orkestra/validation",
  ],
};

export default nextConfig;
