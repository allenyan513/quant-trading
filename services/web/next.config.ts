import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @qt/shared ships raw TS source; let Next compile it.
  transpilePackages: ["@qt/shared"],
  // @qt/shared/db transitively imports `pg` (we never call it — we use the
  // neon-http driver). Keep it external so Next doesn't try to bundle it.
  serverExternalPackages: ["pg"],
  typescript: {
    // We run `tsc --noEmit` separately in CI; don't double-fail the build.
    ignoreBuildErrors: false,
  },
  // @qt/shared source uses NodeNext `.js` import suffixes (e.g. `./schema.js`
  // resolving to schema.ts). Webpack's bundler resolution doesn't rewrite those
  // by default, so map `.js`→`.ts` to let it find the real sources.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
