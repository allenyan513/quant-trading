import { Nav } from "@/components/nav";
import { CommandPalette } from "@/components/command-palette";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell" style={{ display: "flex", minHeight: "100vh" }}>
      <Nav />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 20px",
            borderBottom: "1px solid var(--border)",
            position: "sticky",
            top: 0,
            background: "var(--bg)",
            zIndex: 10,
          }}
        >
          <CommandPalette />
        </header>
        <main style={{ flex: 1, minWidth: 0, padding: 20, maxWidth: 1400, width: "100%", margin: "0 auto" }}>{children}</main>
      </div>
    </div>
  );
}
