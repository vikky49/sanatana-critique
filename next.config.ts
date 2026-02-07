import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // Increase function timeout for PDF processing
  serverExternalPackages: ['unpdf'],
};

export default nextConfig;
