import { TabStub } from "@/components/tab-stub";

export default function OptionsTab() {
  return (
    <TabStub
      title="Options"
      note="No options data source yet (FMP has no options). To be implemented once a data source is evaluated and connected (IV / greeks / option chain) — supports picking a strike for selling puts."
    />
  );
}
