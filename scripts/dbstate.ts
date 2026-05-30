/** Quick DB state dump for manual verification. Run: tsx --env-file=.env scripts/dbstate.ts */
import { getPool } from "../packages/shared/src/db/client.js";

async function main() {
  const p = getPool();
  const counts: Record<string, string> = {};
  for (const t of [
    "events",
    "trading_signals",
    "valuation_snapshots",
    "signal_deliveries",
    "signal_outcomes",
    "feedback_notes",
  ]) {
    counts[t] = (await p.query(`select count(*) n from ${t}`)).rows[0].n;
  }
  console.log("COUNTS", JSON.stringify(counts));

  const ev = await p.query("select status, delivery_status from events");
  console.log("EVENTS", JSON.stringify(ev.rows));

  const s = await p.query(
    "select symbol,direction,conviction,target_price,stop_loss,horizon_days,generated_by from trading_signals order by created_at desc limit 8",
  );
  console.log("SIGNALS");
  for (const r of s.rows) {
    console.log(
      `  ${r.symbol} ${r.direction}/${r.conviction} tgt=${r.target_price} stop=${r.stop_loss} ${r.horizon_days}d (${r.generated_by})`,
    );
  }

  const d = await p.query("select delivery_status, count(*) n from signal_deliveries group by delivery_status");
  console.log("DELIVERIES", JSON.stringify(d.rows));

  const f = await p.query("select symbol, event_type, lesson, scores from feedback_notes order by created_at desc limit 5");
  console.log("FEEDBACK");
  for (const r of f.rows) console.log(`  [${r.symbol}/${r.event_type}] ${r.lesson}  ${JSON.stringify(r.scores)}`);

  await p.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
