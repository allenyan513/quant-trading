/**
 * Landing hero illustration — a stylized "research terminal" rendered as inline SVG
 * (crisp at any size, themeable, no asset/network). A rounded app window with a fair-
 * value valuation card and a candlestick chart, in the dark IBKR palette. Purely
 * decorative: marked aria-hidden. Colors are hardcoded hex to match the CSS tokens
 * (--panel/--border/--accent/--up/--down/--muted) since SVG is static markup.
 */
export function HeroIllustration() {
  return (
    <svg
      viewBox="0 0 640 400"
      width="100%"
      role="img"
      aria-hidden="true"
      style={{ display: "block", maxWidth: 640, margin: "0 auto", height: "auto" }}
    >
      <defs>
        {/* Soft accent glow behind the window — the Apple-style ambient light. */}
        <radialGradient id="hero-glow" cx="50%" cy="38%" r="60%">
          <stop offset="0%" stopColor="#58a6ff" stopOpacity="0.22" />
          <stop offset="55%" stopColor="#58a6ff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#58a6ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#58a6ff" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#58a6ff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ambient glow */}
      <rect x="0" y="0" width="640" height="400" fill="url(#hero-glow)" />

      {/* app window */}
      <g>
        <rect x="56" y="36" width="528" height="328" rx="18" fill="#131822" stroke="#232c3d" strokeWidth="1.5" />
        {/* title bar */}
        <rect x="56" y="36" width="528" height="44" rx="18" fill="#1b2230" />
        <rect x="56" y="62" width="528" height="18" fill="#1b2230" />
        <circle cx="82" cy="58" r="5" fill="#f85149" />
        <circle cx="100" cy="58" r="5" fill="#d29922" />
        <circle cx="118" cy="58" r="5" fill="#3fb950" />
        <rect x="250" y="50" width="140" height="16" rx="8" fill="#0b0e14" />
        <line x1="56" y1="80" x2="584" y2="80" stroke="#232c3d" strokeWidth="1.5" />

        {/* left: fair-value card */}
        <g>
          <text x="84" y="124" fill="#8a97ab" fontSize="12" fontFamily="monospace" letterSpacing="1">FAIR VALUE</text>
          <text x="84" y="160" fill="#d7dee9" fontSize="34" fontWeight="700" fontFamily="monospace">$214.80</text>
          <rect x="84" y="178" width="92" height="24" rx="12" fill="rgba(63,185,80,0.15)" />
          <text x="98" y="195" fill="#3fb950" fontSize="13" fontWeight="700" fontFamily="monospace">+18.4%</text>

          {/* mini stat rows */}
          <g fontFamily="monospace" fontSize="12.5">
            <text x="84" y="236" fill="#8a97ab">P/E</text>
            <text x="240" y="236" fill="#d7dee9" textAnchor="end">22.4×</text>
            <line x1="84" y1="248" x2="240" y2="248" stroke="#232c3d" strokeWidth="1" />
            <text x="84" y="276" fill="#8a97ab">Rev growth</text>
            <text x="240" y="276" fill="#d7dee9" textAnchor="end">+14%</text>
            <line x1="84" y1="288" x2="240" y2="288" stroke="#232c3d" strokeWidth="1" />
            <text x="84" y="316" fill="#8a97ab">13F holders</text>
            <text x="240" y="316" fill="#d7dee9" textAnchor="end">37</text>
          </g>
        </g>

        {/* divider */}
        <line x1="288" y1="104" x2="288" y2="332" stroke="#232c3d" strokeWidth="1.5" />

        {/* right: chart */}
        <g>
          {/* area line */}
          <path
            d="M320 280 L352 264 L384 272 L416 232 L448 244 L480 196 L512 208 L544 156"
            fill="none"
            stroke="#58a6ff"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M320 280 L352 264 L384 272 L416 232 L448 244 L480 196 L512 208 L544 156 L544 332 L320 332 Z" fill="url(#hero-area)" />
          {/* candles */}
          <g>
            <line x1="338" y1="296" x2="338" y2="318" stroke="#3fb950" strokeWidth="1.5" />
            <rect x="333" y="300" width="10" height="14" rx="2" fill="#3fb950" />
            <line x1="372" y1="290" x2="372" y2="316" stroke="#f85149" strokeWidth="1.5" />
            <rect x="367" y="296" width="10" height="14" rx="2" fill="#f85149" />
            <line x1="406" y1="280" x2="406" y2="310" stroke="#3fb950" strokeWidth="1.5" />
            <rect x="401" y="286" width="10" height="18" rx="2" fill="#3fb950" />
            <line x1="440" y1="288" x2="440" y2="314" stroke="#3fb950" strokeWidth="1.5" />
            <rect x="435" y="292" width="10" height="16" rx="2" fill="#3fb950" />
            <line x1="474" y1="270" x2="474" y2="306" stroke="#3fb950" strokeWidth="1.5" />
            <rect x="469" y="276" width="10" height="22" rx="2" fill="#3fb950" />
            <line x1="508" y1="276" x2="508" y2="308" stroke="#f85149" strokeWidth="1.5" />
            <rect x="503" y="282" width="10" height="18" rx="2" fill="#f85149" />
          </g>
          {/* fair-value reference line */}
          <line x1="320" y1="176" x2="544" y2="176" stroke="#58a6ff" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.7" />
          <circle cx="544" cy="156" r="4" fill="#58a6ff" />
        </g>
      </g>
    </svg>
  );
}
