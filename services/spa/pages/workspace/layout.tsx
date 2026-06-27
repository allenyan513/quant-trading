import { Outlet, Navigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Nav } from "@/components/nav";
import { CommandPalette } from "@/components/command-palette";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "@/lib/next-navigation";

/** Browser-style back / forward, next to the command palette — a quick hop to the
 *  previous page without reaching for the trackpad gesture. */
function HistoryNav() {
  const router = useRouter();
  const btn: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--panel-2)",
    color: "var(--muted)",
    cursor: "pointer",
    flex: "0 0 auto",
  };
  return (
    <div style={{ display: "flex", gap: 4 }}>
      <button type="button" aria-label="Back" title="Back" onClick={() => router.back()} style={btn}>
        <ChevronLeft size={16} strokeWidth={2} />
      </button>
      <button type="button" aria-label="Forward" title="Forward" onClick={() => router.forward()} style={btn}>
        <ChevronRight size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

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
          <HistoryNav />
          <CommandPalette />
        </header>
        <main style={{ flex: 1, minWidth: 0, padding: 20, width: "100%" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
