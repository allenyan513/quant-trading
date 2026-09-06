/**
 * The design system's enforcement, for the PUBLIC surface.
 *
 * WHY A TEST AND NOT A DOC: the color tokens in `globals.css` have held for a
 * year because there was a written rule people followed. Layout never had one,
 * and the surface drifted to five container widths (720/760/860/960/1040), two
 * gutter ramps and four different H1 sizes — nobody decided that, it accumulated
 * one page at a time. A rule that only lives in prose gets re-broken by whoever
 * writes the next page in a hurry (including a future Claude session). So it
 * fails `pnpm test` instead, the same way `assertToolGraph()` fails the build.
 *
 * WHAT IS BANNED, and only this:
 *   1. A centered page container with a literal width — `margin: "0 auto"` next
 *      to a numeric `maxWidth`. That exact pattern IS the drift; use
 *      `<PageSection>` (see `components/public-chrome.tsx`).
 *   2. A literal `clamp()` inside `padding` — the page gutter is one ramp,
 *      `var(--page-gutter)`.
 *   3. A literal `clamp()` font size — type steps come from `--fs-*`.
 *
 * WHAT IS NOT BANNED: a `maxWidth` that caps a line of text or an illustration
 * inside a composition (a hero headline's wrap, an image's natural size, the
 * `var(--w-measure)` cap on a long intro paragraph). Those are per-composition
 * decisions and were never the problem — the page CONTAINER is.
 *
 * SCOPE is the public surface only. The workspace is a dense terminal-style app
 * whose layout rules are genuinely different, and sweeping it into this one
 * container would be a much larger change with no reader-facing payoff yet — see
 * `.claude/rules/spa.md`. Adding those files here later is how that scope grows.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/** Every file that renders public, prerendered surface. Listed explicitly rather
 *  than globbed: a new public page should be a deliberate addition here, and an
 *  explicit list cannot silently stop covering a directory that gets renamed. */
const PUBLIC_FILES = [
  "pages/page.tsx",
  "pages/tools/page.tsx",
  "pages/tools/portfolio-backtest/page.tsx",
  "pages/tools/portfolio-backtest/preset-view.tsx",
  "pages/blog/page.tsx",
  "pages/blog/post-view.tsx",
  "pages/about/page.tsx",
  "pages/privacy/page.tsx",
  "pages/terms/page.tsx",
  "components/public-chrome.tsx",
  "components/post-markdown.tsx",
  "components/backtest/preset-links.tsx",
];

/** `components/public-chrome.tsx` is where the tokens are turned into styles, so
 *  it is the one file allowed to write the underlying values. */
const TOKEN_SOURCE = "components/public-chrome.tsx";

const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/** Line numbers make a failure actionable — a rule that reports "somewhere in
 *  this 400-line file" gets suppressed rather than fixed. */
function findLines(source: string, test: (line: string) => boolean): string[] {
  return source
    .split("\n")
    .map((line, i) => [i + 1, line] as const)
    .filter(([, line]) => test(line))
    .map(([n, line]) => `L${n}: ${line.trim().slice(0, 120)}`);
}

describe("public surface design tokens", () => {
  it.each(PUBLIC_FILES)("%s centers containers with <PageSection>, not a literal width", (rel) => {
    const source = read(rel);
    // The drift pattern is a self-centering box with a hand-typed width. Both
    // halves have to be present: a bare `maxWidth` capping a headline is fine.
    const offenders = findLines(source, (line) => /margin:\s*"0 auto"/.test(line) && /maxWidth:\s*\d/.test(line));
    expect(offenders, `use <PageSection> instead of a literal container width:\n${offenders.join("\n")}`).toEqual(
      [],
    );
  });

  it.each(PUBLIC_FILES)("%s uses var(--page-gutter) for horizontal page padding", (rel) => {
    if (rel === TOKEN_SOURCE) return;
    const source = read(rel);
    const offenders = findLines(source, (line) => /padding[^:]*:\s*"[^"]*clamp\(/.test(line));
    expect(offenders, `use var(--page-gutter) / <PageSection pad=…> instead of a literal clamp():\n${offenders.join("\n")}`).toEqual(
      [],
    );
  });

  it.each(PUBLIC_FILES)("%s takes font sizes from the --fs-* scale", (rel) => {
    const source = read(rel);
    const offenders = findLines(source, (line) => /fontSize:\s*"clamp\(/.test(line));
    expect(offenders, `use a --fs-* token instead of a literal clamp() font size:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("token definitions", () => {
  const css = read("src/globals.css");

  it.each([
    "--w-page",
    "--w-measure",
    "--page-gutter",
    "--page-top",
    "--page-bottom",
    "--fs-display",
    "--fs-h1",
    "--fs-h2",
    "--fs-h3",
    "--fs-lead",
    "--fs-body",
    "--fs-copy",
    "--fs-meta",
  ])("globals.css defines %s", (token) => {
    expect(css).toContain(`${token}:`);
  });

  it("defines exactly one container width", () => {
    // A second container tier is how the surface drifted the first time: every
    // new page then has a width DECISION to get wrong. Inner text measures are
    // `--w-measure`, which is not a container and is applied per composition.
    const containerTokens = [...css.matchAll(/--w-[a-z-]+:/g)].map((m) => m[0]);
    expect(containerTokens.sort()).toEqual(["--w-measure:", "--w-page:"]);
  });

  it("keeps the public container at 1040 and the text measure below it", () => {
    const px = (name: string) => Number(new RegExp(`${name}:\\s*(\\d+)px`).exec(css)?.[1]);
    expect(px("--w-page")).toBe(1040);
    expect(px("--w-measure")).toBeLessThan(px("--w-page"));
  });
});
