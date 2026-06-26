"use client";

/** Paper · Settings — account info + Reset (wipe positions/blotter, restore cash). */

import { useLive } from "@/components/live";
import { ResetButton } from "@/components/paper-ledger";
import { Card, Meta } from "@/components/ui";
import { fmtMoney } from "@/lib/format";

interface Acct {
  startingCash: number;
  cash: number;
  realizedPnl: number;
}

export default function PaperSettingsPage() {
  const { data } = useLive<Acct>("/api/paper/account");
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 480 }}>
      <Card title="Paper account">
        <div style={{ display: "grid", gap: 8 }}>
          <Meta label="starting cash" value={fmtMoney(data?.startingCash ?? null)} />
          <Meta label="current cash" value={fmtMoney(data?.cash ?? null)} />
          <Meta label="realized P&L" value={fmtMoney(data?.realizedPnl ?? null)} />
          <div style={{ marginTop: 6 }}>
            <ResetButton />
          </div>
        </div>
      </Card>
    </div>
  );
}
