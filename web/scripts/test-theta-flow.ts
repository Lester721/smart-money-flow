// Test del cliente ThetaData: corre fetchFlow contra una fecha histórica real y muestra RawTrade[].
// Requiere el Theta Terminal corriendo. Uso: node --import tsx scripts/test-theta-flow.ts
import { fetchFlow } from "../lib/thetadata";

(async () => {
  const t0 = Date.now();
  const res = await fetchFlow("AAPL", { dates: ["20241104"], minPremium: 250_000, contractCap: 8 });
  console.log(`\ntrades notables: ${res.trades.length} · escaneos: ${res.pages} · ${Date.now() - t0}ms\n`);
  console.log("símbolo               | precio×tam  | premium | agresor    | sentiment | spot   | Δ     | IV    | OI");
  for (const t of res.trades.slice(0, 12)) {
    const iv = (t.implied_volatility ?? 0).toFixed(2);
    const d = (t.delta ?? 0).toFixed(2);
    console.log(
      `${t.symbol.padEnd(21)} | $${t.price}×${String(t.size).padEnd(4)} | $${(t.premium / 1000).toFixed(0)}k`.padEnd(52) +
      ` | ${t.side.padEnd(10)} | ${t.sentiment.padEnd(9)} | ${String(t.asset_price ?? "—").padEnd(6)} | ${d} | ${iv} | ${t.open_interest}`,
    );
  }
  const buy = res.trades.filter((t) => t.sentiment === "bullish").length;
  const sell = res.trades.filter((t) => t.sentiment === "bearish").length;
  console.log(`\nResumen: ${buy} alcistas · ${sell} bajistas · ${res.trades.length - buy - sell} neutrales`);
})();
