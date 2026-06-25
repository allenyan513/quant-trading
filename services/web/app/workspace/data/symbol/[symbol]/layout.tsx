import { SymbolWorkbench } from "@/components/symbol/workbench";

/**
 * Shared chrome for the per-symbol detail page: the 3-pane research workbench
 * (watchlist rail · center tabs+content · decision panel). Next preserves this
 * layout across tab navigation (only {children} swaps), so the rail + decision
 * panel persist without a refetch.
 */
export default async function SymbolLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  return <SymbolWorkbench symbol={symbol.toUpperCase()}>{children}</SymbolWorkbench>;
}
