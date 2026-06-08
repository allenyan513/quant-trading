import { SymbolHeader } from "@/components/symbol-header";
import { SymbolTabs } from "@/components/symbol-tabs";

/**
 * Shared chrome for the per-symbol detail page: company header + tab bar.
 * Next preserves this layout across tab navigation (only {children} swaps), so
 * the header's data and add-to-watchlist state persist without a refetch.
 */
export default async function SymbolLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const sym = symbol.toUpperCase();
  return (
    <div>
      <SymbolHeader symbol={sym} />
      <SymbolTabs />
      {children}
    </div>
  );
}
