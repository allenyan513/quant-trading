import { Nav } from "@/components/nav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell" style={{ display: "flex", minHeight: "100vh" }}>
      <Nav />
      <main style={{ flex: 1, minWidth: 0, padding: 20, maxWidth: 1400, margin: "0 auto" }}>{children}</main>
    </div>
  );
}
