/**
 * Landing hero illustration — a stylized Claude chat window rendered as inline SVG
 * (crisp at any size, themeable, no asset/network). It mirrors the three-step flow
 * shown below the hero: ① a connector chip (MCP connected) → ② an ask + a BUY signal
 * card + a "paper order filled" confirmation → ③ a review summary. Everything happens
 * in one conversation. Purely decorative (aria-hidden); colors are hardcoded hex to
 * match the CSS tokens (--panel/--panel-2/--border/--accent/--up/--muted).
 */
export function HeroIllustration() {
  return (
    <svg
      viewBox="0 0 640 420"
      width="100%"
      role="img"
      aria-hidden="true"
      style={{ display: "block", maxWidth: 640, margin: "0 auto", height: "auto" }}
    >
      <defs>
        {/* Soft accent glow behind the window — the Apple-style ambient light. */}
        <radialGradient id="hero-glow" cx="50%" cy="36%" r="62%">
          <stop offset="0%" stopColor="#58a6ff" stopOpacity="0.22" />
          <stop offset="55%" stopColor="#58a6ff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#58a6ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect x="0" y="0" width="640" height="420" fill="url(#hero-glow)" />

      {/* chat window */}
      <rect x="48" y="24" width="544" height="372" rx="18" fill="#131822" stroke="#232c3d" strokeWidth="1.5" />
      {/* title bar */}
      <rect x="48" y="24" width="544" height="42" rx="18" fill="#1b2230" />
      <rect x="48" y="48" width="544" height="18" fill="#1b2230" />
      <circle cx="74" cy="45" r="5" fill="#f85149" />
      <circle cx="92" cy="45" r="5" fill="#d29922" />
      <circle cx="110" cy="45" r="5" fill="#3fb950" />
      <rect x="284" y="35" width="72" height="20" rx="10" fill="#0b0e14" />
      <text x="320" y="49" fill="#8a97ab" fontSize="11" fontFamily="ui-sans-serif, system-ui, sans-serif" textAnchor="middle">Claude</text>
      <line x1="48" y1="66" x2="592" y2="66" stroke="#232c3d" strokeWidth="1.5" />

      <g fontFamily="ui-sans-serif, system-ui, sans-serif">
        {/* ① connector chip — MCP connected */}
        <rect x="196" y="84" width="248" height="28" rx="14" fill="#1b2230" stroke="#232c3d" strokeWidth="1" />
        <circle cx="216" cy="98" r="4" fill="#3fb950" />
        <text x="230" y="102" fill="#8a97ab" fontSize="12">SweetValueLab connected</text>

        {/* ② user asks (right bubble) */}
        <rect x="250" y="126" width="318" height="38" rx="13" fill="rgba(88,166,255,0.14)" stroke="rgba(88,166,255,0.32)" strokeWidth="1" />
        <text x="266" y="150" fill="#d7dee9" fontSize="12.5">Research NVDA — buy if it&#39;s a buy</text>

        {/* ② Claude replies with a signal card (left) */}
        <rect x="72" y="176" width="316" height="94" rx="13" fill="#1b2230" stroke="#232c3d" strokeWidth="1" />
        <rect x="88" y="192" width="48" height="22" rx="11" fill="rgba(63,185,80,0.16)" />
        <text x="112" y="207" fill="#3fb950" fontSize="12" fontWeight="700" textAnchor="middle">BUY</text>
        <text x="148" y="208" fill="#d7dee9" fontSize="13" fontWeight="700">NVDA</text>
        <text x="88" y="244" fill="#d7dee9" fontSize="23" fontWeight="700" fontFamily="ui-monospace, monospace">$214.80</text>
        <text x="88" y="261" fill="#8a97ab" fontSize="11">Fair value
          <tspan fill="#3fb950" dx="8" fontWeight="700">+18%</tspan>
        </text>
        {/* mini sparkline inside the card */}
        <path d="M250 250 L272 238 L292 242 L312 220 L332 226 L356 200" fill="none" stroke="#58a6ff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="356" cy="200" r="3.5" fill="#58a6ff" />

        {/* ② paper order filled (left, green pill) */}
        <rect x="72" y="284" width="244" height="28" rx="14" fill="rgba(63,185,80,0.12)" stroke="rgba(63,185,80,0.3)" strokeWidth="1" />
        <text x="88" y="302" fill="#3fb950" fontSize="12" fontWeight="700">✓</text>
        <text x="104" y="302" fill="#3fb950" fontSize="12">Paper order filled · 10 sh</text>

        {/* ③ review summary (left bubble) */}
        <rect x="72" y="328" width="312" height="40" rx="13" fill="#1b2230" stroke="#232c3d" strokeWidth="1" />
        <text x="88" y="353" fill="#d7dee9" fontSize="12.5">Reviewed — portfolio
          <tspan fill="#3fb950" dx="6" fontWeight="700">+4.2%</tspan>
          <tspan fill="#8a97ab" dx="6">this week</tspan>
        </text>
      </g>
    </svg>
  );
}
