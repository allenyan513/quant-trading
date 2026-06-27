import { Outlet } from "react-router-dom";
import { PortfolioNav } from "@/components/portfolio-nav";

/**
 * Portfolio section: a Paper | Live toggle over two ledgers. "Live" is the read-only
 * IBKR account (Flex sync) with its positions / performance / trades / morning-brief /
 * settings tabs; "Paper" is the per-user, order-driven simulated account. Toggle +
 * Live tabs live in PortfolioNav.
 */
export default function PortfolioLayout() {
  return (
    <div>
      <PortfolioNav />
      <Outlet />
    </div>
  );
}
