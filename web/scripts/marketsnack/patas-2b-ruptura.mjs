// PATAS SUELTAS · 2b — ¿DÓNDE ESTÁ LA RUPTURA DEL 16-JUL?
// El encargo dice que asset_price viene nulo en 54-68% ANTES y 0,0% DESPUÉS. En los 27 tickers
// medibles sale 0,0% en los dos lados. Antes de dar por bueno el corte hay que ver dónde vive
// ese nulo: si es de los índices (SPX/NDX/VIX), no toca nada de lo que se mide aquí.
//
// Uso: node --import tsx scripts/marketsnack/patas-2b-ruptura.mjs [100k|1000k]

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import rl from "node:readline";

const NIVEL = process.argv[2] || "100k";
const DIR = path.resolve(`scripts/cache-theta/marketsnack/flujo-${NIVEL}`);
const P = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
const INDICES = new Set(["SPX", "SPXW", "NDX", "RUT", "VIX", "XSP", "VIXW", "NDXP", "RUTW"]);

const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).sort();
const tramo = { antes: {}, despues: {} };
const mk = () => ({ n: 0, nulAsset: 0, score0: 0, nulScore: 0, nulSide: 0, idxN: 0, idxNul: 0, eqN: 0, eqNul: 0 });
tramo.antes = mk(); tramo.despues = mk();
const porDia = [];

for (const f of dias) {
  const dia = f.replace(".jsonl.gz", "");
  const g = mk();
  const inp = fs.createReadStream(path.join(DIR, f)).pipe(zlib.createGunzip());
  for await (const l of rl.createInterface({ input: inp })) {
    if (!l.trim()) continue;
    let x; try { x = JSON.parse(l); } catch { continue; }
    g.n++;
    if (x.asset_price == null) g.nulAsset++;
    if (x.score === 0) g.score0++;
    if (x.score == null) g.nulScore++;
    if (x.side == null) g.nulSide++;
    const m = P.exec(x.symbol ?? "");
    const esIdx = m && INDICES.has(m[1]);
    if (esIdx) { g.idxN++; if (x.asset_price == null) g.idxNul++; }
    else { g.eqN++; if (x.asset_price == null) g.eqNul++; }
  }
  porDia.push([dia, g]);
  const T = dia < "2026-07-16" ? tramo.antes : tramo.despues;
  for (const k of Object.keys(g)) T[k] += g[k];
}

const pc = (a, b) => (b ? ((a / b) * 100).toFixed(1) : "—") + "%";
console.log(`═══ RUPTURA · nivel ${NIVEL} ═══\n`);
console.log(`   tramo      n         asset nulo   score=0    índices:nulo   acciones:nulo`);
for (const [k, T] of [["ANTES  ", tramo.antes], ["DESPUÉS", tramo.despues]]) {
  console.log(`   ${k}  ${String(T.n).padStart(9)}   ${pc(T.nulAsset, T.n).padStart(7)}     ${pc(T.score0, T.n).padStart(7)}   ${pc(T.idxNul, T.idxN).padStart(7)} (n=${T.idxN})   ${pc(T.eqNul, T.eqN).padStart(7)} (n=${T.eqN})`);
}
console.log(`\n── por día (los 6 alrededor del corte) ──`);
const i = porDia.findIndex(([d]) => d >= "2026-07-16");
for (const [d, g] of porDia.slice(Math.max(0, i - 3), i + 4)) {
  console.log(`   ${d}  n=${String(g.n).padStart(6)}  asset nulo=${pc(g.nulAsset, g.n).padStart(7)}  score0=${pc(g.score0, g.n).padStart(7)}  idx nulo=${pc(g.idxNul, g.idxN).padStart(7)}  acc nulo=${pc(g.eqNul, g.eqN).padStart(7)}`);
}
