// RECONOCIMIENTO previo al ingrediente DOLARES-GRIEGOS. No mide nada: sólo mira de qué está
// hecho el fichero antes de construir la métrica. (Regla: mirar el fichero antes de medirlo.)
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

const D = "scripts/cache-theta/marketsnack/flujo-100k";
const CHART = "scripts/cache-theta/marketsnack/aux/chart-all";
const RE = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;

const conPrecio = new Set(fs.readdirSync(CHART).map((f) => f.replace(".json.gz", "")));
const dias = fs.readdirSync(D).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();
console.log(`días en disco: ${dias.length}  (${dias[0]} → ${dias[dias.length - 1]})`);
console.log(`tickers con serie de precio: ${conPrecio.size}\n`);

const muestra = [dias[2], dias[20], dias[40], dias[60], dias[dias.length - 3]];
const horas = {}, sides = {}, roots = {};
let n = 0, mal = 0, nulAP = 0, askMal = 0, nulD = 0, nulG = 0, sinSize = 0;
const malos = [];

for (const d of muestra) {
  const raw = zlib.gunzipSync(fs.readFileSync(path.join(D, `${d}.jsonl.gz`))).toString("utf8").split("\n").filter(Boolean);
  for (const l of raw) {
    const t = JSON.parse(l); n++;
    horas[t.timestamp.slice(11, 13)] = (horas[t.timestamp.slice(11, 13)] || 0) + 1;
    sides[t.side] = (sides[t.side] || 0) + 1;
    const m = RE.exec(t.symbol || "");
    if (!m) { mal++; if (malos.length < 10) malos.push(t.symbol); }
    else roots[m[1]] = (roots[m[1]] || 0) + 1;
    if (t.asset_price == null) nulAP++;
    if (!(t.ask_price > 0) || t.bid_price > t.ask_price) askMal++;
    if (!Number.isFinite(t.delta)) nulD++;
    if (!Number.isFinite(t.gamma)) nulG++;
    if (!(t.size > 0)) sinSize++;
  }
}
const pc = (x) => ((100 * x) / n).toFixed(2) + "%";
console.log(`muestra de 5 días · n=${n.toLocaleString("es-ES")}`);
console.log(`  símbolo no parseable : ${mal} (${pc(mal)})  ej: ${malos.join(", ")}`);
console.log(`  asset_price nulo     : ${nulAP} (${pc(nulAP)})`);
console.log(`  ask=0 o cruzado      : ${askMal} (${pc(askMal)})`);
console.log(`  delta no finito      : ${nulD} (${pc(nulD)})`);
console.log(`  gamma no finito      : ${nulG} (${pc(nulG)})`);
console.log(`  size<=0              : ${sinSize} (${pc(sinSize)})`);
console.log(`\nHORA UTC (mercado 13:30–20:00 UTC en EDT):`);
console.log("  " + Object.entries(horas).sort().map(([k, v]) => `${k}h:${(100 * v / n).toFixed(1)}%`).join("  "));
console.log(`\nSIDE:`);
console.log("  " + Object.entries(sides).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${pc(v)}`).join("  "));

const rs = Object.entries(roots).sort((a, b) => b[1] - a[1]);
const conP = rs.filter(([r]) => conPrecio.has(r));
const sinP = rs.filter(([r]) => !conPrecio.has(r));
const tot = rs.reduce((a, [, v]) => a + v, 0);
console.log(`\nRAÍCES: ${rs.length} distintas`);
console.log(`  con serie de precio : ${conP.length} raíces, ${(100 * conP.reduce((a, [, v]) => a + v, 0) / tot).toFixed(1)}% de las operaciones`);
console.log(`  SIN serie de precio : ${sinP.length} raíces, ${(100 * sinP.reduce((a, [, v]) => a + v, 0) / tot).toFixed(1)}% de las operaciones`);
console.log(`  top sin precio: ${sinP.slice(0, 15).map(([k, v]) => `${k}:${v}`).join(" ")}`);
console.log(`  top con precio: ${conP.slice(0, 15).map(([k, v]) => `${k}:${v}`).join(" ")}`);

// ¿Cuántas raíces con precio por día? -> ¿alcanza para ordenar en tercios transversalmente?
const porDia = new Map();
for (const d of muestra) {
  const raw = zlib.gunzipSync(fs.readFileSync(path.join(D, `${d}.jsonl.gz`))).toString("utf8").split("\n").filter(Boolean);
  const s = new Set();
  for (const l of raw) {
    const t = JSON.parse(l); const m = RE.exec(t.symbol || ""); if (!m) continue;
    if (!conPrecio.has(m[1])) continue;
    if (t.timestamp.slice(11, 16) >= "19:00") continue;   // corte 15:00 ET
    s.add(m[1]);
  }
  porDia.set(d, s.size);
}
console.log(`\nRAÍCES CON PRECIO por día antes del corte 19:00 UTC: ${[...porDia].map(([d, k]) => `${d}=${k}`).join("  ")}`);

// última barra de precio: ¿es de hoy y por tanto parcial?
const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CHART, "SPY.json.gz"))).toString("utf8"));
console.log(`\nSPY chart: ${j.data.length} barras · última ${j.data[j.data.length - 1].t} = ${j.data[j.data.length - 1].v} (OJO: si es HOY es parcial)`);
