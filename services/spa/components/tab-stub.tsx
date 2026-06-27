/** Placeholder for per-symbol tabs not yet implemented. */
export function TabStub({ title, note }: { title: string; note: string }) {
  return (
    <div
      style={{
        border: "1px dashed var(--border)",
        borderRadius: 10,
        padding: "32px 20px",
        textAlign: "center",
        color: "var(--muted)",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13 }}>{note}</div>
    </div>
  );
}
