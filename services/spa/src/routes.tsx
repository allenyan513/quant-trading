import { Routes, Route, Navigate } from "react-router-dom";

// Public
import HomePage from "@/pages/page";
import SignInPage from "@/pages/sign-in/page";
import SignUpPage from "@/pages/sign-up/page";
import ConsentPage from "@/pages/oauth/consent/page";

// Workspace shell + section layouts
import DashboardLayout from "@/pages/workspace/layout";
import PortfolioLayout from "@/pages/workspace/portfolio/layout";
import PaperLayout from "@/pages/workspace/portfolio/paper/layout";
import LiveLayout from "@/pages/workspace/portfolio/live/layout";
import DiscoverLayout from "@/pages/workspace/discover/layout";
import LegendLayout from "@/pages/workspace/discover/legends/[cik]/layout";
import SymbolLayout from "@/pages/workspace/data/symbol/[symbol]/layout";

// Portfolio · Paper
import PaperPositions from "@/pages/workspace/portfolio/paper/page";
import PaperOrders from "@/pages/workspace/portfolio/paper/orders/page";
import PaperTrades from "@/pages/workspace/portfolio/paper/trades/page";
import PaperPerformance from "@/pages/workspace/portfolio/paper/performance/page";
import PaperBriefList from "@/pages/workspace/portfolio/paper/morning-brief/page";
import PaperBriefDetail from "@/pages/workspace/portfolio/paper/morning-brief/[date]/page";
import PaperSettings from "@/pages/workspace/portfolio/paper/settings/page";

// Portfolio · Live
import LivePositions from "@/pages/workspace/portfolio/live/page";
import LiveTrades from "@/pages/workspace/portfolio/live/trades/page";
import LivePerformance from "@/pages/workspace/portfolio/live/performance/page";
import LiveBriefList from "@/pages/workspace/portfolio/live/morning-brief/page";
import LiveBriefDetail from "@/pages/workspace/portfolio/live/morning-brief/[date]/page";
import LiveSettings from "@/pages/workspace/portfolio/live/settings/page";

// Watchlist + Memo
import WatchlistPage from "@/pages/workspace/watchlist/page";
import MemoListPage from "@/pages/workspace/memo/page";
import MemoDetailPage from "@/pages/workspace/memo/[id]/page";

// Discover
import MoversPage from "@/pages/workspace/discover/movers/page";
import ScreenerPage from "@/pages/workspace/discover/screener/page";
import EarningsPage from "@/pages/workspace/discover/earnings/page";
import EconomicPage from "@/pages/workspace/discover/economic/page";
import DiscoverNewsPage from "@/pages/workspace/discover/news/page";
import LegendsPage from "@/pages/workspace/discover/legends/page";
import LegendHoldings from "@/pages/workspace/discover/legends/[cik]/holdings/page";
import LegendActivity from "@/pages/workspace/discover/legends/[cik]/activity/page";
import LegendBuys from "@/pages/workspace/discover/legends/[cik]/buys/page";
import LegendSells from "@/pages/workspace/discover/legends/[cik]/sells/page";
import LegendHistory from "@/pages/workspace/discover/legends/[cik]/history/page";

// Data + symbol detail tabs
import DataPage from "@/pages/workspace/data/page";
import DataEvents from "@/pages/workspace/data/events/page";
import DataNotifications from "@/pages/workspace/data/notifications/page";
import SymbolChart from "@/pages/workspace/data/symbol/[symbol]/chart/page";
import SymbolValuation from "@/pages/workspace/data/symbol/[symbol]/valuation/page";
import SymbolFinancials from "@/pages/workspace/data/symbol/[symbol]/financials/page";
import SymbolAnalysts from "@/pages/workspace/data/symbol/[symbol]/analysts/page";
import SymbolOwnership from "@/pages/workspace/data/symbol/[symbol]/ownership/page";
import SymbolEvents from "@/pages/workspace/data/symbol/[symbol]/events/page";
import SymbolNews from "@/pages/workspace/data/symbol/[symbol]/news/page";
import SymbolMemo from "@/pages/workspace/data/symbol/[symbol]/memo/page";
import SymbolOverall from "@/pages/workspace/data/symbol/[symbol]/overall/page";

// Alpha + System
import AlphaPage from "@/pages/workspace/alpha/page";
import AlphaSignals from "@/pages/workspace/alpha/signals/page";
import AlphaValuations from "@/pages/workspace/alpha/valuations/page";
import SystemPage from "@/pages/workspace/system/page";
import SystemLogs from "@/pages/workspace/system/logs/page";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/sign-up" element={<SignUpPage />} />
      <Route path="/oauth/consent" element={<ConsentPage />} />

      <Route path="/workspace" element={<DashboardLayout />}>
        <Route index element={<Navigate to="/workspace/portfolio/paper" replace />} />

        <Route path="portfolio" element={<PortfolioLayout />}>
          <Route index element={<Navigate to="/workspace/portfolio/paper" replace />} />
          <Route path="paper" element={<PaperLayout />}>
            <Route index element={<PaperPositions />} />
            <Route path="orders" element={<PaperOrders />} />
            <Route path="trades" element={<PaperTrades />} />
            <Route path="performance" element={<PaperPerformance />} />
            <Route path="morning-brief" element={<PaperBriefList />} />
            <Route path="morning-brief/:date" element={<PaperBriefDetail />} />
            <Route path="settings" element={<PaperSettings />} />
          </Route>
          <Route path="live" element={<LiveLayout />}>
            <Route index element={<LivePositions />} />
            <Route path="trades" element={<LiveTrades />} />
            <Route path="performance" element={<LivePerformance />} />
            <Route path="morning-brief" element={<LiveBriefList />} />
            <Route path="morning-brief/:date" element={<LiveBriefDetail />} />
            <Route path="settings" element={<LiveSettings />} />
          </Route>
        </Route>

        <Route path="watchlist" element={<WatchlistPage />} />

        <Route path="memo">
          <Route index element={<MemoListPage />} />
          <Route path=":id" element={<MemoDetailPage />} />
        </Route>

        <Route path="discover" element={<DiscoverLayout />}>
          <Route index element={<Navigate to="/workspace/discover/movers" replace />} />
          <Route path="movers" element={<MoversPage />} />
          <Route path="screener" element={<ScreenerPage />} />
          <Route path="earnings" element={<EarningsPage />} />
          <Route path="economic" element={<EconomicPage />} />
          <Route path="news" element={<DiscoverNewsPage />} />
          <Route path="legends">
            <Route index element={<LegendsPage />} />
            <Route path=":cik" element={<LegendLayout />}>
              <Route index element={<Navigate to="holdings" replace />} />
              <Route path="holdings" element={<LegendHoldings />} />
              <Route path="activity" element={<LegendActivity />} />
              <Route path="buys" element={<LegendBuys />} />
              <Route path="sells" element={<LegendSells />} />
              <Route path="history" element={<LegendHistory />} />
            </Route>
          </Route>
        </Route>

        <Route path="data">
          <Route index element={<DataPage />} />
          <Route path="events" element={<DataEvents />} />
          <Route path="notifications" element={<DataNotifications />} />
          <Route path="symbol/:symbol" element={<SymbolLayout />}>
            <Route index element={<Navigate to="chart" replace />} />
            <Route path="chart" element={<SymbolChart />} />
            <Route path="valuation" element={<SymbolValuation />} />
            <Route path="financials" element={<SymbolFinancials />} />
            <Route path="analysts" element={<SymbolAnalysts />} />
            <Route path="ownership" element={<SymbolOwnership />} />
            <Route path="events" element={<SymbolEvents />} />
            <Route path="news" element={<SymbolNews />} />
            <Route path="memo" element={<SymbolMemo />} />
            <Route path="overall" element={<SymbolOverall />} />
          </Route>
        </Route>

        <Route path="alpha">
          <Route index element={<AlphaPage />} />
          <Route path="signals" element={<AlphaSignals />} />
          <Route path="valuations" element={<AlphaValuations />} />
        </Route>

        <Route path="system">
          <Route index element={<SystemPage />} />
          <Route path="logs" element={<SystemLogs />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
