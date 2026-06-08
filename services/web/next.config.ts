import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Self-host on Cloud Run: emit a self-contained Node server (.next/standalone)
  // so the runtime image needs no pnpm/workspace — just `node server.js`.
  output: "standalone",
  // Monorepo: trace deps from the repo root (two levels up from services/web)
  // so the standalone bundle includes the workspace @qt/shared + hoisted deps.
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  // @qt/shared ships raw TS source; let Next compile it.
  transpilePackages: ["@qt/shared"],
  // @qt/shared/db transitively imports `pg` (we never call it — we use the
  // neon-http driver). Keep it external so Next doesn't try to bundle it.
  serverExternalPackages: ["pg"],
  // Per-symbol pages consolidated under /data/symbol/[symbol]/*. Keep the old
  // entry points working (the activity timeline lives on the Overall tab now).
  async redirects() {
    return [
      { source: "/data/valuation/:symbol", destination: "/data/symbol/:symbol/valuation", permanent: false },
      { source: "/symbol/:symbol", destination: "/data/symbol/:symbol/overall", permanent: false },
    ];
  },
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
