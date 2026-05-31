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
};

export default nextConfig;
