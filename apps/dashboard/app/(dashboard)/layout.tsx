import { Nav } from "@/components/nav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>{children}</main>
    </>
  );
}
