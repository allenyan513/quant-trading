/**
 * `next/navigation`-compatible shims over react-router-dom, so ported components keep
 * their `useRouter()/useParams()/usePathname()` call sites unchanged.
 *
 * NOTE: `useSelectedLayoutSegment` is NOT shimmed — it depends on the layout's position
 * in the tree, which react-router can't infer generically. The few call sites derive the
 * active segment from the pathname via `segmentAfter(pathname, base)` instead.
 */
import { useNavigate, useParams as rrUseParams, useLocation } from "react-router-dom";

/** Next's `useRouter()` surface, mapped to react-router's imperative navigate. */
export function useRouter() {
  const navigate = useNavigate();
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, { replace: true }),
    back: () => navigate(-1),
    forward: () => navigate(1),
    refresh: () => {},
    prefetch: () => {},
  };
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>(): T {
  return rrUseParams() as T;
}

export function usePathname(): string {
  return useLocation().pathname;
}

/** The first path segment after `base` (replaces `useSelectedLayoutSegment` for tab bars). */
export function segmentAfter(pathname: string, base: string): string | null {
  if (!pathname.startsWith(base)) return null;
  const rest = pathname.slice(base.length).split("/").filter(Boolean);
  return rest[0] ?? null;
}

/** Next's `notFound()` — throws; a route-level error element renders the 404. */
export function notFound(): never {
  throw new Error("not_found");
}
