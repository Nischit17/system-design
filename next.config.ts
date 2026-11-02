import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/pricing", destination: "/problems", permanent: false },
      { source: "/signup", destination: "/problems", permanent: false },
    ];
  },
};

export default nextConfig;
