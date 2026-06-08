import { TabStub } from "@/components/tab-stub";

export default function OptionsTab() {
  return (
    <TabStub
      title="Options"
      note="暂无期权数据源（FMP 不含期权）。待评估并接入数据源（IV / greeks / 期权链）后实现 —— 服务卖 put 选 strike。"
    />
  );
}
