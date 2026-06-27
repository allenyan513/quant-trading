import { Outlet, useParams } from "react-router-dom";
import { SymbolWorkbench } from "@/components/symbol/workbench";

/**
 * Shared chrome for the per-symbol detail page: the 3-pane research workbench
 * (watchlist rail · center tabs+content · decision panel). React Router preserves this
 * layout across tab navigation (only the <Outlet/> swaps), so the rail + decision
 * panel persist without a refetch.
 */
export default function SymbolLayout() {
  const { symbol = "" } = useParams<{ symbol: string }>();
  return (
    <SymbolWorkbench symbol={symbol.toUpperCase()}>
      <Outlet />
    </SymbolWorkbench>
  );
}
