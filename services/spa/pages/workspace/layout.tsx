import { Outlet, Navigate } from "react-router-dom";
import { Nav } from "@/components/nav";
import { CommandPalette } from "@/components/command-palette";
import { useSession } from "@/lib/auth-client";

/**
 * Workspace shell + auth gate (replaces web's `middleware.ts`). Unauthenticated users
 * are sent to the public homepage; the nested pages render through <Outlet/>.
 */
export default function DashboardLayout() {
  const { data: session, isPending } = useSession();
  if (isPending) return null;
  if (!session) return <Navigate to="/" replace />;
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
        <main style={{ flex: 1, minWidth: 0, padding: 20, width: "100%" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
