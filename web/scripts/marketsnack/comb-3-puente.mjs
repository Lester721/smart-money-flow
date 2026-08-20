// ═══ COMBINACIÓN · PASO 3 — POR QUÉ NO SALIÓ Y QUÉ HARÍA FALTA ══════════════════════════
//
// La primaria dio t=0,80 contra un listón de 2,0, se le da la vuelta en el tercer tercio y
// pierde contra el azar (percentil 57,6%). Esto NO se cierra con "no pasó". Aquí se mide:
//
//   1. POR QUÉ HAY TAN POCAS VENTANAS (50 de 86 días) — dónde se pierde la muestra.
//   2. QUÉ ES DE VERDAD `size > open_interest` — se sospecha que NO marca "posición nueva"
//      sino "contrato con poco interés abierto". Si es eso, el ingrediente estaba mal hecho
//      y el mecanismo nunca llegó a probarse.
//   3. EL PUENTE: la clasificación VERDADERA de apertura/cierre sí existe en este fichero.
//      El OI que se ve el día D es el cierre de D−1 (ya validado). Luego
//         ΔOI(contrato, D) = OI_visto(D+1) − OI_visto(D)
//      es la variación NETA de interés abierto DURANTE el día D. Se conoce al cerrar D, así
//      que no sirve para operar intradía en D, pero sí para el horizonte cierre(D)→cierre(D+1).
//      Aquí se mide cuánta cobertura tendría ese cálculo.
//   4. CUÁNTA MUESTRA y CUÁNTO DINERO haría falta para resolverlo.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const RAIZ = path.join("scripts", "cache-theta", "marketsnack");
const DIR = path.join(RAIZ, "flujo-100k");
const CH = path.join(RAIZ, "aux", "chart-all");
const SAL = JSON.parse(fs.readFileSync(path.join("scripts", "marketsnack", "comb-2-salida.json"), "utf8"));

const PROXY = { SPX: "SPY", SPXW: "SPY", XSP: "SPY", NDX: "QQQ", NDXP: "QQQ", RUT: "IWM" };
const APAL = new Set(["TQQQ","SOXL","SQQQ","SOXS","UVXY","TZA","TNA","SPXU","UPRO","LABU","LABD","YINN","FNGU","NVDL","TSLL","BOIL","KOLD","VXX","SVIX","UVIX"]);
const COMPRA = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const VENTA  = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);
const CORTE = 10 * 60 + 30;
const parseOcc = (s) => {
  const k = s.slice(-8), t = s.slice(-9, -8), d = s.slice(-15, -9), u = s.slice(0, -15);
  return (/^\d{8}$/.test(k) && /^[CP]$/.test(t) && /^\d{6}$/.test(d) && u) ? { u, call: t === "C" } : null;
};
const cierres = new Set(fs.readdirSync(CH).filter((f) => f.endsWith(".json.gz")).map((f) => f.slice(0, -8)));
const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);
const medianaDe = (v) => { const o = [...v].sort((a, b) => a - b); return o.length ? o[Math.floor(o.length / 2)] : 0; };

// ── 1 y 2 · recorrido único ──────────────────────────────────────────────────────────────
const porDiaSimb = new Map();          // dia → Map(T → {ops,nOps})
const oiPorDia = new Map();            // dia → Map(occ → OI)  (foto diaria, cierre de D−1)
const oiNueva = [], oiVieja = [];      // OI del contrato según la operación sea "nueva" o no
const sizeNueva = [], sizeVieja = [];
let opsTot = 0;

for (const dia of dias) {
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(DIR, `${dia}.jsonl.gz`))).toString("utf8").trim();
  if (!txt) continue;
  const simb = new Map(); porDiaSimb.set(dia, simb);
  const oi = new Map(); oiPorDia.set(dia, oi);
  for (const l of txt.split("\n")) {
    if (!l) continue;
    const r = JSON.parse(l);
    const o = parseOcc(r.symbol); if (!o) continue;
    if (r.open_interest != null) oi.set(r.symbol, r.open_interest);
    const T = PROXY[o.u] ?? o.u;
    if (APAL.has(T) || !cierres.has(T)) continue;
    if (r.open_interest == null || r.size == null || r.premium == null || r.side == null) continue;
    if (!COMPRA.has(r.side) && !VENTA.has(r.side)) continue;
    if (r.ask_price === 0 || r.bid_price === 0) continue;
    const min = ((Date.parse(r.timestamp) - 4 * 3600e3) / 60000) % 1440;
    if (min >= CORTE) continue;
    opsTot++;
    let a = simb.get(T); if (!a) { a = { ops: 0, nOps: 0 }; simb.set(T, a); }
    a.ops++;
    if (r.size > r.open_interest) { a.nOps++; oiNueva.push(r.open_interest); sizeNueva.push(r.size); }
    else { oiVieja.push(r.open_interest); sizeVieja.push(r.size); }
  }
}

console.log("═══ 1 · DÓNDE SE PIERDE LA MUESTRA (corte 10:30, 86 días de flujo) ═══════════════");
let d0 = 0, d5 = 0, d20 = 0;
const serie = [];
for (const [dia, simb] of [...porDiaSimb].sort()) {
  const n = [...simb.values()].filter((a) => a.ops >= 5 && a.nOps >= 3).length;
  serie.push({ dia, n, simbTot: simb.size });
  if (simb.size === 0) d0++;
  if (n >= 5) d5++;
  if (n >= 20) d20++;
}
console.log(`  días con flujo antes de las 10:30                 : ${serie.filter((s) => s.simbTot > 0).length} de ${dias.length}`);
console.log(`  días con ≥1 símbolo utilizable (ops≥5 y nuevas≥3)  : ${serie.filter((s) => s.n >= 1).length}`);
console.log(`  días con ≥20 símbolos (el mínimo del test)         : ${d20}`);
console.log(`  mediana de símbolos utilizables por día            : ${medianaDe(serie.map((s) => s.n))}`);
const flojos = serie.filter((s) => s.n < 20).map((s) => s.dia);
console.log(`  días que se caen por tener <20 símbolos            : ${flojos.length}  (primeros: ${flojos.slice(0, 6).join(", ")}${flojos.length > 6 ? " …" : ""})`);
console.log(`  ventanas efectivas del test                        : ${SAL.ventanas}\n`);

console.log("═══ 2 · ¿QUÉ MARCA DE VERDAD `size > open_interest`? ════════════════════════════");
console.log(`  operaciones antes de las 10:30 usadas: ${opsTot.toLocaleString("es-ES")}`);
console.log(`  marcadas NUEVAS  : ${oiNueva.length.toLocaleString("es-ES")} (${((oiNueva.length / opsTot) * 100).toFixed(1)}%)`);
console.log(`  OI del contrato — NUEVAS : p25=${medianaDe(oiNueva.filter((_,i)=>i%1===0).slice(0, oiNueva.length)) && ""}`);
const q = (v, p) => { const o = [...v].sort((a, b) => a - b); return o[Math.min(o.length - 1, Math.floor(o.length * p))]; };
console.log(`     NUEVAS  → OI  p25=${q(oiNueva,0.25)}  p50=${q(oiNueva,0.5)}  p75=${q(oiNueva,0.75)}  p95=${q(oiNueva,0.95)}`);
console.log(`     RESTO   → OI  p25=${q(oiVieja,0.25)}  p50=${q(oiVieja,0.5)}  p75=${q(oiVieja,0.75)}  p95=${q(oiVieja,0.95)}`);
console.log(`     NUEVAS  → size p50=${q(sizeNueva,0.5)}   RESTO → size p50=${q(sizeVieja,0.5)}`);
console.log(`  → el filtro selecciona contratos con OI ${(q(oiVieja,0.5) / Math.max(1, q(oiNueva,0.5))).toFixed(0)}x más pequeño, no operaciones más grandes.\n`);

// ── 3 · el puente: ΔOI real entre fotos de días consecutivos ─────────────────────────────
console.log("═══ 3 · EL PUENTE — ΔOI verdadero entre fotos consecutivas ══════════════════════");
let paresDia = 0, contratosComunes = 0, contratosDiaD = 0, deltaNoCero = 0;
const ordenados = [...oiPorDia.keys()].sort();
for (let i = 0; i < ordenados.length - 1; i++) {
  const a = oiPorDia.get(ordenados[i]), b = oiPorDia.get(ordenados[i + 1]);
  if (!a.size || !b.size) continue;
  paresDia++;
  contratosDiaD += a.size;
  for (const [occ, v] of a) {
    if (!b.has(occ)) continue;
    contratosComunes++;
    if (b.get(occ) !== v) deltaNoCero++;
  }
}
console.log(`  pares de días consecutivos con fotos      : ${paresDia}`);
console.log(`  contratos vistos el día D                  : ${contratosDiaD.toLocaleString("es-ES")}`);
console.log(`  de ellos vistos también en D+1 (ΔOI real)  : ${contratosComunes.toLocaleString("es-ES")} (${((contratosComunes / contratosDiaD) * 100).toFixed(1)}%)`);
console.log(`  con ΔOI distinto de cero                   : ${deltaNoCero.toLocaleString("es-ES")} (${((deltaNoCero / Math.max(1, contratosComunes)) * 100).toFixed(1)}% de los comunes)`);
console.log(`  → el ΔOI VERDADERO es computable para el ${((contratosComunes / contratosDiaD) * 100).toFixed(1)}% del flujo, pero sólo se conoce`);
console.log(`    al abrir D+1: obliga al horizonte cierre(D)→cierre(D+1), no vale para intradía.\n`);

// ── 4 · cuánta muestra y cuánto dinero ───────────────────────────────────────────────────
console.log("═══ 4 · CUÁNTO FALTA ════════════════════════════════════════════════════════════");
const sep = SAL.primaria.sep, sdS = SAL.primaria.sd, n = SAL.ventanas, LIST = SAL.liston;
const CUENTA = 56389, DIAS_ANO = 252;
const necesarias = Math.ceil(((LIST * sdS) / Math.abs(sep)) ** 2);
console.log(`  separación observada ${(sep * 100).toFixed(3)}%/día · desviación ${(sdS * 100).toFixed(3)}% · ventanas ${n} · t=${SAL.primaria.t.toFixed(2)}`);
console.log(`  ventanas necesarias para llegar a |t|=${LIST} con ESTE efecto: ${necesarias.toLocaleString("es-ES")}`);
console.log(`  ventanas que faltan: ${(necesarias - n).toLocaleString("es-ES")}  ≈ ${((necesarias - n) / 21 * (86 / SAL.ventanas)).toFixed(1)} meses de captura diaria`);
const detectable = LIST * sdS / Math.sqrt(n);
console.log(`  con las ${n} ventanas de hoy sólo se vería una separación ≥ ${(detectable * 100).toFixed(3)}%/día (${(detectable / Math.abs(sep)).toFixed(1)}x la observada)`);

console.log(`\n  ── EN DÓLARES AL AÑO (sobre $${CUENTA.toLocaleString("es-ES")}) ──`);
const bruto = sep * CUENTA * DIAS_ANO;
const ee = sdS / Math.sqrt(n);
console.log(`  bruto largo/corto : $${bruto.toFixed(0)}/año   (IC al listón: $${((sep - LIST * ee) * CUENTA * DIAS_ANO).toFixed(0)} … $${((sep + LIST * ee) * CUENTA * DIAS_ANO).toFixed(0)} — CRUZA EL CERO)`);
for (const pb of [2, 5, 10]) {
  const peaje = (pb / 10000) * 4;   // 2 patas × entrada y salida
  console.log(`  peaje a ${String(pb).padStart(2)} pb por cruce (4 cruces/día): ${(peaje * 100).toFixed(3)}%/día = $${(peaje * CUENTA * DIAS_ANO).toFixed(0)}/año → neto $${((sep - peaje) * CUENTA * DIAS_ANO).toFixed(0)}`);
}
console.log(`  separación mínima para cubrir SÓLO el peaje a 5 pb: ${((5 / 10000 * 4) * 100).toFixed(2)}%/día = ${((5 / 10000 * 4) / Math.abs(sep)).toFixed(1)}x la observada`);
console.log(`  AVISO: MarketSnack no sirve horquilla de ACCIONES. Esos pb son un escenario declarado,`);
console.log(`  NO una medición. Sin NBBO de acciones no hay cifra neta real y no se va a inventar.`);

fs.writeFileSync(path.join("scripts", "marketsnack", "comb-3-salida.json"), JSON.stringify({
  diasConFlujo: serie.filter((s) => s.simbTot > 0).length, diasCon20: d20, ventanas: SAL.ventanas,
  medianaSimb: medianaDe(serie.map((s) => s.n)),
  oiNuevaP50: q(oiNueva, 0.5), oiViejaP50: q(oiVieja, 0.5), sizeNuevaP50: q(sizeNueva, 0.5), sizeViejaP50: q(sizeVieja, 0.5),
  fracNuevas: oiNueva.length / opsTot,
  puente: { paresDia, contratosDiaD, contratosComunes, cobertura: contratosComunes / contratosDiaD, deltaNoCero: deltaNoCero / Math.max(1, contratosComunes) },
  necesarias, faltan: necesarias - n, detectable, bruto, ee,
}, null, 1));
console.log("\n(guardado comb-3-salida.json)");
