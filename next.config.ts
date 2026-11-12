import type { NextConfig } from "next";

// Caching deliberately conservative: every page in this app is private and
// rendered per request. Cache Components / PPR are disabled so no confidential
// output can end up in a shared cache.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "pg", "pg-boss", "pdf-lib", "jszip"],
  experimental: {
    // admin uploads go through server actions; limit matches UPLOAD_MAX_MB default (100 MB) + overhead
    serverActions: { bodySizeLimit: "110mb" },
    proxyClientMaxBodySize: "110mb",
  },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
    ];
    if (process.env.NODE_ENV === "production") {
      common.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
    }
    return [{ source: "/:path*", headers: common }];
  },
};

export default nextConfig;
