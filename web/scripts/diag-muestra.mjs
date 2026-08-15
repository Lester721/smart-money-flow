// Coge las PRIMERAS operaciones de la muestra real de EVA y pide su cotización una por una,
// enseñando el URL y el código. Si el formato es bueno y aun así fallan, el fallo está en
// QUÉ contratos se están pidiendo, no en CÓMO.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "scripts/cache-theta/flujo-historico";
const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "") + "/v3";
const MIN_PRIMA = 5_000_000;

const porTicker = {};
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  const d = JSON.parse(readFileSync(join(DIR, f), "utf8"));
  if (d.sinDatos) continue;
  const t = d.sym ?? f.split("_")[0];
  porTicker[t] ??= [];
  for (const n of d.notables ?? []) {
    if (n.prima < MIN_PRIMA || n.bid == null || n.ask == null || n.oi == null) continue;
    porTicker[t].push({ ...n, ticker: t, dia: d.dia });
  }
}

// Las 3 primeras de cada ticker: así se ve si falla un ticker concreto o todos.
const prueba = [];
for (const [t, ops] of Object.entries(porTicker)) {
  ops.sort((a, b) => a.dia.localeCompare(b.dia) || a.ts.localeCompare(b.ts));
  prueba.push(...ops.slice(0, 3));
}

console.log(`probando ${prueba.length} contratos (3 por ticker)\n`);
let ok = 0, mal = 0;
for (const n of prueba) {
  const expYmd = String(n.exp).replace(/-/g, "");
  const d = String(n.dia).replace(/-/g, "");
  const qs = `symbol=${n.ticker}&expiration=${expYmd}&strike=${n.strike}&right=${n.right}` +
             `&start_date=${d}&end_date=${d}&interval=1m`;
  const r = await fetch(`${B}/option/history/quote?${qs}`, { signal: AbortSignal.timeout(45_000) });
  const t = await r.text();
  const filas = r.ok ? t.trim().split("\n").length - 1 : 0;
  if (filas > 0) ok++; else mal++;
  console.log(`${filas > 0 ? "OK  " : "FALLO"} ${r.status} · ${String(filas).padStart(5)} filas · ` +
              `${n.ticker} ${n.exp} ${n.strike}${n.right} día ${n.dia}` +
              (filas > 0 ? "" : `  ← ${t.slice(0, 60).replace(/\n/g, " ")}`));
}
console.log(`\nresumen: ${ok} con datos · ${mal} sin datos`);
