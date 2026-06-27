/**
 * Next-compatible `<Link href=…>` shim over react-router, so every ported call site
 * keeps `href` (Next's prop) unchanged. Strips Next-only props react-router ignores.
 */
import { Link as RRLink } from "react-router-dom";
import type { AnchorHTMLAttributes } from "react";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  // Next-only props (no-ops here).
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
};

export function Link({ href, prefetch: _p, replace, scroll: _s, ...rest }: LinkProps) {
  return <RRLink to={href} replace={replace} {...rest} />;
}

export default Link;
