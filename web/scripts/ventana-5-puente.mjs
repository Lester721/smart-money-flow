// VENTANA CORTA · 5 — EL PUENTE: ¿cuánto tendría que valer la señal para pagar el peaje a 1-2 DTE?
//
// Lo medido hasta aquí:
//   · la señal existe en el precio de la OPCIÓN: escalera monótona de 7 lados, ABOVE_ASK +1,93%
//     de movimiento del punto medio hasta el cierre, BELOW_BID −1,37%.
//   · nadie la cobra: a plazos largos (mediana 228 DTE) el peaje es del mismo tamaño.
//
// Aquí se calcula, con datos reales, las TRES piezas que faltan para saber si a 1-2 DTE sí se
// cobraría, sin inventar ninguna:
//   1. la ventaja en el SUBYACENTE: del precio del activo en el instante del print (asset_price,
//      que trae el propio registro) al cierre real de ese día.  ← ojo con la ruptura del 16-jul
//   2. la ELASTICIDAD real: cuánto se mueve el punto medio de la opción por cada 1% del subyacente,
//      por plazo y distancia — medida sobre cadenas reales de cierre a cierre.
//   3. el PEAJE por plazo (ya medido en ventana-4).
// Punto de equilibrio: ventaja_subyacente × elasticidad(plazo) > peaje(plazo).

import { diasFlujo, leerDia, parseOCC, cadena, cierres, calendario, media, tUna, pct } from "./ventana-lib.mjs";
import { readdirSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const TICKERS = [...new Set(readdirSync(CDIR).filter((f) => /_d\d{8}\.json$/.test(f)).map((f) => f.split("_d")[0]))].sort();
const conCadena = new Set(TICKERS);
const cal = calendario();
const iso = (a) => `${a.slice(0, 4)}-${a.slice(4, 6)}-${a.slice(6, 8)}`;
const dteDe = (e, d) => Math.round((new Date(`${iso(e)}T00:00:00Z`) - new Date(`${iso(d)}T00:00:00Z`)) / 864e5);

// ── 1. VENTAJA EN EL SUBYACENTE: asset_price del print → cierre real del día ────────────────
console.log(`\n## 1. ¿Predice el print el movimiento del SUBYACENTE hasta el cierre?\n`);
const porLado = new Map();
let sinAsset = 0, conAsset = 0;
const cls = new Map(TICKERS.map((t) => [t, cierres(t)]));
for (const dia of diasFlujo("100k")) {
  const dc = dia.replace(/-/g, "");
  for (const o of leerDia(dia, "100k")) {
    const p = parseOCC(o.symbol);
    if (!p || !conCadena.has(p.raiz)) continue;
    const hhmm = o.timestamp.slice(11, 16);
    if (hhmm < "13:30" || hhmm > "19:30") continue;
    const S0 = o.asset_price, cl = cls.get(p.raiz);
    if (!(S0 > 0)) { sinAsset++; continue; }
    const S1 = cl?.[dc];
    if (!(S1 > 0)) continue;
    conAsset++;
    // dirección: la que compró el que pagó. Call = al alza, Put = a la baja.
    const r = (S1 / S0 - 1) * (p.tipo === "C" ? 1 : -1);
    const k = `${o.side}|${dia < "2026-07-16" ? "antes" : "despues"}`;
    if (!porLado.has(k)) porLado.set(k, []);
    porLado.get(k).push({ r, fecha: dia });
  }
}
console.log(`  con asset_price utilizable: ${conAsset} · sin asset_price: ${sinAsset} (${(100 * sinAsset / (conAsset + sinAsset)).toFixed(1)}%)`);
console.log(`\n  ${"lado".padEnd(11)} ${"tramo".padEnd(8)} ${"n".padStart(7)} ${"días".padStart(5)}   ventaja media   t por día`);
for (const lado of ["ABOVE_ASK", "AT_ASK", "ASKSIDE", "MIDMKT", "BIDSIDE", "AT_BID", "BELOW_BID"]) {
  for (const tr of ["antes", "despues"]) {
    const g = porLado.get(`${lado}|${tr}`);
    if (!g || g.length < 100) { console.log(`  ${lado.padEnd(11)} ${tr.padEnd(8)} ${String(g?.length ?? 0).padStart(7)}   — muestra corta`); continue; }
    const m = new Map();
    for (const x of g) { if (!m.has(x.fecha)) m.set(x.fecha, []); m.get(x.fecha).push(x.r); }
    const d = [...m.values()].map(media);
    console.log(`  ${lado.padEnd(11)} ${tr.padEnd(8)} ${String(g.length).padStart(7)} ${String(d.length).padStart(5)}   ${(100 * media(g.map((x) => x.r))).toFixed(3).padStart(11)}%   ${tUna(d).toFixed(2).padStart(7)}`);
  }
}

// ── 2. ELASTICIDAD real: Δ% del punto medio de la opción por cada 1% del subyacente ─────────
console.log(`\n## 2. Elasticidad real (cadenas de cierre a cierre, ${TICKERS.length} tickers)\n`);
const BUCKETS = [[0, 0, "0 DTE"], [1, 2, "1-2 DTE"], [3, 5, "3-5"], [6, 10, "6-10"], [11, 20, "11-20"], [21, 45, "21-45"], [46, 120, "46-120"], [121, 9999, ">120"]];
const bucket = (d) => BUCKETS.find(([a, b]) => d >= a && d <= b)?.[2] ?? null;
const el = new Map();      // "bucket|zona" -> []
const dias = cal.filter((d) => d >= "20260422" && d <= "20260806");
for (const t of TICKERS) {
  const cl = cls.get(t);
  if (!cl) continue;
  for (let i = 0; i + 1 < dias.length; i++) {
    const d = dias[i], d2 = dias[i + 1];
    const S = cl[d], S2 = cl[d2];
    if (!(S > 0) || !(S2 > 0)) continue;
    const rS = S2 / S - 1;
    if (Math.abs(rS) < 0.005) continue;                   // sin movimiento no hay elasticidad que medir
    const c = cadena(t, d), c2 = cadena(t, d2);
    if (!c || !c2) continue;
    for (const exp of Object.keys(c)) {
      const dte = dteDe(exp, d), b = bucket(dte);
      if (b === null || dte < 1) continue;                // el 0 DTE de hoy no existe mañana
      const e2 = c2[exp];
      if (!e2) continue;
      for (const [ks, v] of Object.entries(c[exp])) {
        const w = e2[ks];
        if (!w) continue;
        const [b1, a1] = v, [b2, a2] = w;
        if (!(b1 > 0 && a1 > 0 && b2 > 0 && a2 > 0)) continue;
        const [kStr, tipo] = ks.split("|"), K = Number(kStr);
        const dist = tipo === "C" ? K / S - 1 : 1 - K / S;
        const zona = Math.abs(dist) <= 0.01 ? "ATM" : (dist > 0.01 && dist <= 0.05 ? "OTM1-5" : (dist > 0.05 && dist <= 0.15 ? "OTM5-15" : null));
        if (!zona) continue;
        const rO = ((b2 + a2) / 2) / ((b1 + a1) / 2) - 1;
        const dir = tipo === "C" ? 1 : -1;
        const k2 = `${b}|${zona}`;
        if (!el.has(k2)) el.set(k2, []);
        el.get(k2).push(rO / (rS * dir));                 // % de opción por 1% de subyacente a favor
      }
    }
  }
}
console.log(`  ${"plazo".padEnd(9)} ${"zona".padEnd(8)} ${"n".padStart(8)}   elasticidad MEDIANA (×)`);
for (const [, , b] of BUCKETS) for (const z of ["ATM", "OTM1-5", "OTM5-15"]) {
  const v = el.get(`${b}|${z}`);
  if (!v || v.length < 200) continue;
  console.log(`  ${b.padEnd(9)} ${z.padEnd(8)} ${String(v.length).padStart(8)}   ${pct(v, 0.5).toFixed(1).padStart(6)}×   (p25 ${pct(v, 0.25).toFixed(1)}× · p75 ${pct(v, 0.75).toFixed(1)}×)`);
}

// ── 3. PUNTO DE EQUILIBRIO ─────────────────────────────────────────────────────────────────
// peaje mediano medido en ventana-4 (ATM)
const PEAJE = { "0 DTE": 0.3434, "1-2 DTE": 0.0500, "3-5": 0.0387, "6-10": 0.0422, "11-20": 0.0533, "21-45": 0.0505, "46-120": 0.0262, ">120": 0.0431 };
console.log(`\n## 3. Punto de equilibrio — qué ventaja hace falta EN EL SUBYACENTE, por plazo (ATM)\n`);
console.log(`  ${"plazo".padEnd(9)} ${"elasticidad".padStart(12)} ${"peaje".padStart(8)}   ventaja mínima necesaria en el subyacente`);
for (const [, , b] of BUCKETS) {
  const v = el.get(`${b}|ATM`);
  if (!v || v.length < 200 || !PEAJE[b]) continue;
  const e = pct(v, 0.5);
  console.log(`  ${b.padEnd(9)} ${(e.toFixed(1) + "×").padStart(12)} ${(100 * PEAJE[b]).toFixed(2).padStart(7)}%   ${(100 * PEAJE[b] / e).toFixed(3)}%  de movimiento del activo a favor`);
}
console.log(`\n  (el peaje del 0 DTE está medido en la cotización de CIERRE del día de vencimiento — el contrato ya está muerto ahí.`);
console.log(`   No sirve como peaje intradía del 0 DTE; se deja a la vista para no fingir que se sabe.)`);
