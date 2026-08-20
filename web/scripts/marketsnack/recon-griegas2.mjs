// RECONOCIMIENTO 2 — las dos preguntas que deciden si la métrica es medible:
//   (1) ¿la falta de delta/gamma se parte en el 2026-07-16 como lo hace asset_price?
//       Si se parte, los tercios del período serían poblaciones distintas y el hallazgo sería
//       de la tubería de MarketSnack, no del mercado.
//   (2) ¿las barras de chart-all son cierres de verdad? Se contrastan contra el MCP de trading.
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

const D = "scripts/cache-theta/marketsnack/flujo-100k";
const RE = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
const dias = fs.readdirSync(D).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();

console.log("día        n      sinGriegas%  sinAssetPrice%  sinSide%  MIDMKT%");
const filas = [];
for (const d of dias) {
  const raw = zlib.gunzipSync(fs.readFileSync(path.join(D, `${d}.jsonl.gz`))).toString("utf8").split("\n").filter(Boolean);
  let n = 0, sg = 0, sap = 0, ss = 0, mid = 0;
  for (const l of raw) {
    const t = JSON.parse(l);
    if (!RE.test(t.symbol || "")) continue;
    n++;
    if (!Number.isFinite(t.delta) || !Number.isFinite(t.gamma)) sg++;
    if (t.asset_price == null) sap++;
    if (t.side == null) ss++;
    if (t.side === "MIDMKT") mid++;
  }
  filas.push({ d, n, sg: n ? sg / n : 0, sap: n ? sap / n : 0, ss: n ? ss / n : 0, mid: n ? mid / n : 0 });
}
for (const f of filas) {
  console.log(`${f.d}  ${String(f.n).padStart(6)}   ${(100 * f.sg).toFixed(1).padStart(6)}      ${(100 * f.sap).toFixed(1).padStart(6)}       ${(100 * f.ss).toFixed(2).padStart(6)}   ${(100 * f.mid).toFixed(1).padStart(5)}`);
}
const antes = filas.filter((f) => f.d < "2026-07-16");
const desde = filas.filter((f) => f.d >= "2026-07-16");
const m = (a, k) => (a.reduce((s, x) => s + x[k], 0) / a.length * 100).toFixed(2);
console.log(`\nANTES 16-jul (${antes.length} días): sinGriegas ${m(antes, "sg")}%  sinAssetPrice ${m(antes, "sap")}%  MIDMKT ${m(antes, "mid")}%`);
console.log(`DESDE 16-jul (${desde.length} días): sinGriegas ${m(desde, "sg")}%  sinAssetPrice ${m(desde, "sap")}%  MIDMKT ${m(desde, "mid")}%`);
