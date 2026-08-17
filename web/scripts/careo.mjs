// CAREO: el backtest contra el forward test EN LOS MISMOS DÍAS.
// Si los dos leen el mismo mercado y aplican la misma regla, tienen que dar el mismo crédito.
// Si no coinciden, uno de los dos está mal y hay que saber cuál ANTES de poner dinero.

import { readFileSync, readdirSync, existsSync } from "node:fs";
const DIR = "scripts/cache-theta/gex-2026", HORA = "11:00", ALA = 50, SEP = 25, PASO = 5;
const led = JSON.parse(readFileSync("data/forward/gex-condor.json", "utf8"));
const ops = (Array.isArray(led) ? led : led.ops || led.ledger || []).filter((o) => o.credito != null);

function leer(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike","timestamp","bid","ask","underlying_price"].map((c) => cab.indexOf(c));
  const m = new Map(); let U = 0;
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    if (String(c[iT]).slice(11, 16) !== HORA) continue;
    const u = Number(c[iU]); if (u > 0) U = u;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) m.set(K, { bid, ask });
  }
  return m.size ? { m, U } : null;
}

console.log(`\n## CAREO · ${ops.length} días con operación en vivo\n`);
console.log("| día | SPX vivo | SPX backtest | strikes vivo | strikes backtest | crédito VIVO | crédito BACKTEST | dif |");
console.log("|---|---|---|---|---|---|---|---|");
for (const o of ops) {
  const C = leer(o.dia, "C"), P = leer(o.dia, "P");
  if (!C || !P) { console.log(`| ${o.dia} | ${o.spx} | **SIN DATOS EN EL BACKTEST** | | | $${Math.round(o.credito*100)} | — | — |`); continue; }
  // MISMA regla que el forward: redondear el spot al paso de strike y separar 25.
  const red = (x) => Math.round(x / PASO) * PASO;
  const Kc = red(C.U) + SEP, Kp = red(C.U) - SEP;
  const c = C.m.get(Kc), cA = C.m.get(Kc + ALA), p = P.m.get(Kp), pA = P.m.get(Kp - ALA);
  if (!c || !cA || !p || !pA) { console.log(`| ${o.dia} | ${o.spx} | ${C.U.toFixed(2)} | ${o.callCorta}/${o.putCorta} | faltan strikes | $${Math.round(o.credito*100)} | — | — |`); continue; }
  const cred = (c.bid + p.bid - cA.ask - pA.ask) * 100;
  const vivo = o.credito * 100;
  console.log(`| ${o.dia} | ${o.spx} | ${C.U.toFixed(2)} | ${o.callCorta}/${o.putCorta} | ${Kc}/${Kp} | **$${Math.round(vivo)}** | **$${Math.round(cred)}** | ${Math.round(cred - vivo) >= 0 ? "+" : "−"}$${Math.abs(Math.round(cred - vivo))} |`);
}

// Y el contexto: qué créditos daban esos MISMOS días de agosto en el backtest completo
console.log(`\n── todos los días de agosto 2026 que hay en el backtest ──\n`);
const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(2026-08-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
const cerca = (m, obj) => [...m.keys()].reduce((a, b) => (Math.abs(b - obj) < Math.abs(a - obj) ? b : a));
for (const d of fechas) {
  const C = leer(d, "C"), P = leer(d, "P"); if (!C || !P) continue;
  const Kc = cerca(C.m, C.U + SEP), Kp = cerca(P.m, C.U - SEP);
  const c = C.m.get(Kc), cA = C.m.get(cerca(C.m, Kc + ALA)), p = P.m.get(Kp), pA = P.m.get(cerca(P.m, Kp - ALA));
  if (!c || !cA || !p || !pA) continue;
  console.log(`   ${d} · SPX ${C.U.toFixed(2)} · crédito $${Math.round((c.bid + p.bid - cA.ask - pA.ask) * 100)}`);
}
