// ═══ COMBINACIÓN · PASO 1 — RECON DE FORMA (sin tocar un solo retorno) ══════════════════
//
// Ninguna señal sobrevivió por separado. La única combinación con MECANISMO que une a las dos
// que más cerca se quedaron es:
//
//   · "el LADO llega temprano"  (t=2,09 preinscrito) da el SIGNO de la cobertura del creador.
//   · "el OI por operación"     (t=2,08, listón 2,99) dice si esa cobertura es NUEVA:
//     size > open_interest es aritméticamente imposible de ser un cierre.
//
// MECANISMO: cuando un cliente COMPRA una call que ABRE interés, el creador queda corto de
// gamma y tiene que comprar acciones. Si esa misma compra CIERRA una posición previa, el
// creador DESHACE cobertura — el empuje sobre el precio es del signo contrario, o no existe.
// `direccion` cruda mezcla las dos poblaciones. Este paso mide si hay muestra para separarlas.
//
// AQUÍ NO SE MIDE NADA QUE DEPENDA DEL FUTURO. Sólo se cuentan operaciones. La decisión de
// qué corte horario usar se toma con estos recuentos y queda CERRADA antes de ver un retorno.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const RAIZ = path.join("scripts", "cache-theta", "marketsnack");
const DIR = path.join(RAIZ, "flujo-100k");
const CH = path.join(RAIZ, "aux", "chart-all");

// ── universo idéntico al del hallazgo del LADO (no se re-elige nada) ──────────────────────
const PROXY = { SPX: "SPY", SPXW: "SPY", XSP: "SPY", NDX: "QQQ", NDXP: "QQQ", RUT: "IWM" };
const APAL = new Set(["TQQQ","SOXL","SQQQ","SOXS","UVXY","TZA","TNA","SPXU","UPRO","LABU","LABD","YINN","FNGU","NVDL","TSLL","BOIL","KOLD","VXX","SVIX","UVIX"]);
const COMPRA = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const VENTA  = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);
const CORTES = [9 * 60 + 45, 10 * 60, 10 * 60 + 30, 11 * 60, 12 * 60];

const parseOcc = (s) => {
  const k = s.slice(-8), t = s.slice(-9, -8), d = s.slice(-15, -9), u = s.slice(0, -15);
  return (/^\d{8}$/.test(k) && /^[CP]$/.test(t) && /^\d{6}$/.test(d) && u) ? { u, call: t === "C" } : null;
};

const conPrecio = new Set(fs.readdirSync(CH).filter((f) => f.endsWith(".json.gz")).map((f) => f.slice(0, -8)));
const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();

console.log(`dias de flujo en disco: ${dias.length}  (${dias[0]} → ${dias[dias.length - 1]})`);
console.log(`simbolos con serie de precio: ${conPrecio.size}\n`);

// agg[c] : clave "T|dia" → recuentos
const agg = CORTES.map(() => new Map());
let totalOps = 0, sinOcc = 0, sinPrecio = 0, sinOI = 0, sinLado = 0, conLado = 0, nuevasTot = 0;
const censoIndices = new Map();

for (const dia of dias) {
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(DIR, `${dia}.jsonl.gz`))).toString("utf8").trim();
  if (!txt) continue;
  for (const l of txt.split("\n")) {
    if (!l) continue;
    const r = JSON.parse(l);
    totalOps++;
    const o = parseOcc(r.symbol); if (!o) { sinOcc++; continue; }
    const T = PROXY[o.u] ?? o.u;
    if (APAL.has(T) || !conPrecio.has(T)) {
      sinPrecio++;
      censoIndices.set(o.u, (censoIndices.get(o.u) ?? 0) + 1);
      continue;
    }
    if (r.open_interest == null || r.size == null || r.premium == null) { sinOI++; continue; }
    const comp = COMPRA.has(r.side), vend = VENTA.has(r.side);
    if (!comp && !vend) { sinLado++; continue; }
    conLado++;
    const nueva = r.size > r.open_interest;      // NO puede ser un cierre (aritmética pura)
    if (nueva) nuevasTot++;
    const min = ((Date.parse(r.timestamp) - 4 * 3600e3) / 60000) % 1440;
    const k = `${T}|${dia}`;
    for (let c = 0; c < CORTES.length; c++) {
      if (min >= CORTES[c]) continue;
      let a = agg[c].get(k);
      if (!a) { a = { T, dia, ops: 0, nOps: 0, prima: 0, nPrima: 0 }; agg[c].set(k, a); }
      a.ops++; a.prima += r.premium || 0;
      if (nueva) { a.nOps++; a.nPrima += r.premium || 0; }
    }
  }
}

const pct = (x, y) => ((x / y) * 100).toFixed(1) + "%";
console.log("── CENSO DE OPERACIONES ────────────────────────────────────────────────");
console.log(`  totales en los ${dias.length} dias : ${totalOps.toLocaleString("es-ES")}`);
console.log(`  simbolo no-OCC              : ${sinOcc.toLocaleString("es-ES")} (${pct(sinOcc, totalOps)})`);
console.log(`  sin serie de precio / apalancado : ${sinPrecio.toLocaleString("es-ES")} (${pct(sinPrecio, totalOps)})`);
console.log(`  sin open_interest/size/premium   : ${sinOI.toLocaleString("es-ES")} (${pct(sinOI, totalOps)})`);
console.log(`  lado no clasificable (MIDMKT…)   : ${sinLado.toLocaleString("es-ES")} (${pct(sinLado, totalOps)})`);
console.log(`  UTILIZABLES (lado + OI + precio) : ${conLado.toLocaleString("es-ES")} (${pct(conLado, totalOps)})`);
console.log(`     de ellas ABREN posicion nueva : ${nuevasTot.toLocaleString("es-ES")} (${pct(nuevasTot, conLado)} de las utilizables)\n`);

const topFuera = [...censoIndices].sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log("  lo que se queda fuera por no tener precio (top 8): " + topFuera.map(([t, n]) => `${t} ${(n / 1000).toFixed(0)}k`).join(" · ") + "\n");

// ── cuantos simbolos por dia sobreviven a cada umbral de operaciones NUEVAS ───────────────
const mediana = (v) => { const o = [...v].sort((a, b) => a - b); return o.length ? o[Math.floor(o.length / 2)] : 0; };

console.log("── SIMBOLOS UTILIZABLES POR DIA (mediana) segun el minimo de operaciones NUEVAS ──");
console.log("corte   min1  min2  min3  min5  min8   |  ops/simb  nOps/simb  %prima nueva");
const tabla = [];
for (let c = 0; c < CORTES.length; c++) {
  const porDia = new Map();
  for (const a of agg[c].values()) { if (!porDia.has(a.dia)) porDia.set(a.dia, []); porDia.get(a.dia).push(a); }
  const fila = { corte: CORTES[c], cuentas: {} };
  for (const min of [1, 2, 3, 5, 8]) {
    fila.cuentas[min] = mediana([...porDia.values()].map((g) => g.filter((a) => a.nOps >= min && a.ops >= 5).length));
  }
  const todos = [...agg[c].values()].filter((a) => a.ops >= 5);
  const opsM = mediana(todos.map((a) => a.ops));
  const nOpsM = mediana(todos.map((a) => a.nOps));
  const primaN = todos.reduce((s, a) => s + a.nPrima, 0) / todos.reduce((s, a) => s + a.prima, 0);
  const et = `${String(Math.floor(CORTES[c] / 60)).padStart(2, "0")}:${String(CORTES[c] % 60).padStart(2, "0")}`;
  console.log(`${et}   ${[1,2,3,5,8].map((m) => String(fila.cuentas[m]).padStart(4)).join("  ")}   |  ${String(opsM).padStart(7)}  ${String(nOpsM).padStart(8)}  ${(primaN * 100).toFixed(1).padStart(11)}%`);
  tabla.push({ et, ...fila.cuentas, opsM, nOpsM, primaN });
}

fs.writeFileSync(path.join("scripts", "marketsnack", "comb-1-salida.json"),
  JSON.stringify({ dias: dias.length, desde: dias[0], hasta: dias[dias.length - 1], totalOps, conLado, nuevasTot, tabla }, null, 1));
console.log("\n(guardado comb-1-salida.json)");
