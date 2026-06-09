import { TabStub } from "@/components/tab-stub";

export default function ChartTab() {
  return (
    <TabStub
      title="Chart"
      note="数据已就绪（data_daily_prices OHLCV）。本 tab 规划中：lightweight-charts 蜡烛图 + 成交量，叠加公允价。"
    />
  );
}
