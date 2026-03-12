/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
    unoptimized: true,
  },
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        {
          source: "/api/:path*",
          destination: `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000"}/api/:path*`,
        },
      ],
    };
  },
  webpack(config) {
    config.resolve.alias["pino-pretty"] = require.resolve("./src/lib/pino-pretty-stub.js");
    return config;
  },
};

module.exports = nextConfig;
