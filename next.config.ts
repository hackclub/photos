import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
  serverExternalPackages: ["mediainfo.js"],
  allowedDevOrigins: [
    "192.168.0.32",
    ...(process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []),
  ],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/mediainfo.js/dist/MediaInfoModule.wasm"],
  },
  reactCompiler: true,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000,
    localPatterns: [
      {
        pathname: "/hackclub-icon.png",
      },
      {
        pathname: "/lost.png",
      },
      {
        pathname: "/media/**",
      },
      {
        pathname: "/assets/**",
      },
      {
        pathname: "/api/v1/download/**",
      },
      {
        pathname: "/api/v1/view/**",
      },
      {
        pathname: "/media/**",
        search: "?t=*",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.amazonaws.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.storage.impossibleapi.net",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.hel1.your-objectstorage.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.gravatar.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cachet.dunkirk.sh",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "api.dicebear.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cdn.hackclub.com",
        pathname: "/**",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  async headers() {
    return [
      {
        source: "/face-capture/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(self)" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; media-src 'self' blob: data: https:; font-src 'self' data:; connect-src 'self' https:;",
          },
        ],
      },
    ];
  },
};
export default nextConfig;
