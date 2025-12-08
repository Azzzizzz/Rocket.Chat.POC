import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      net: false,
      tls: false,
      fs: false,
      child_process: false,
      dns: false,
    };
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/api/rc/:path*',
        destination: 'http://127.0.0.1:2000/api/v1/:path*',
      },
    ];
  },
};

export default nextConfig;
