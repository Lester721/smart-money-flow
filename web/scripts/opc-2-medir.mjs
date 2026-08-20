// ═══════════════════════════════════════════════════════════════════════════════════════════
// OPERAR · OPCIONES (2) — ¿paga el vehículo 0DTE lo que el nivel promete?
//
// ═══ QUÉ SE MIDE ═══════════════════════════════════════════════════════════════════════════
// Los NIVELES ya están construidos (scripts/gex-niveles.json) con el OI del día ANTERIOR y el
// precio de las 09:35. Aquí NO se descubre un nivel nuevo: se coge lo que los niveles dicen y
// se compra la opción 0DTE de SPXW correspondiente, al precio que se paga de verdad.
//
//   · se COMPRA al ASK y se VENDE al BID. Nunca punto medio.
//   · el valor al vencimiento es el INTRÍNSECO exacto contra el subyacente de las 16:00 de la
//     MISMA serie de la cadena (un solo feed, sin cruzar con barras de otro sitio).
//   · Black-Scholes no entra: no hay ni una prima modelada en todo el fichero.
//
// ═══ LA REJILLA, DECLARADA ANTES DE MIRAR ══════════════════════════════════════════════════
//   2 señales × 4 vehículos × 4 salidas = 32 pruebas → el listón sale de listonT(32).
//   Señales:   S1 imán gamD en días de gamma neta NEGATIVA (la única que replicó en las dos
//              mitades según el agente del imán) · S2 punto de giro (gamma flip), todos los días
//   Vehículos: ATM · 0,25% fuera · 0,5% fuera · vertical de débito ATM→0,5%
//   Salidas:   vencimiento (intrínseco) · tocar el nivel (bid real) · 12:00 (bid real) ·
//              15:55 (bid real)
//
// ═══ EL CONTROL QUE DECIDE ═════════════════════════════════════════════════════════════════
//   (a) el mismo vehículo con el LADO al azar
//   (b) el mismo vehículo con el NIVEL al azar a la MISMA distancia del precio
//   Si el muro/imán no le gana a una línea puesta al azar a la misma distancia, no existe.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/opc-2-medir.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from "node:fs";

const CUENTA = 56389, EFECTIVO = 7977;
const PRUEBAS_DECLARADAS = 32;
const SORTEOS = 400;

function listonT(pruebas) {
  if (pruebas <= 1) return 2;
  const p = 0.05 / pruebas / 2;
  const t = Math.sqrt(-2 * Math.log(p));
  return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100;
}
const LISTON = listonT(PRUEBAS_DECLARADAS);

function exigir(c, m) { if (!c) throw new Error(`FALLO CERRADO: ${m}`); }
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tOf = (v) => (v.length > 1 && sd(v) > 0 ? media(v) / (sd(v) / Math.sqrt(v.length)) : NaN);
const pctl = (v, p) => { const s = [...v].filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))] : NaN; };
const med = (v) => pctl(v, 50);
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString("es-ES") : "—");
function rng(s0) { let a = s0 >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function rachas(s) { let peor = 0, act = 0, caida = 0, acum = 0, pico = 0; for (const x of s) { if (x < 0) { act++; peor = Math.max(peor, act); } else act = 0; acum += x; pico = Math.max(pico, acum); caida = Math.min(caida, acum - pico); } return { peor, caida }; }

// ── datos ──────────────────────────────────────────────────────────────────────────────────
const NIV = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
const nivPorFecha = new Map(NIV.filas.map((f) => [f.fecha, f]));
const CACHE = readFileSync("scripts/opc-cache.ndjson", "utf8").trim().split("\n").map((l) => JSON.parse(l));

console.log("\n" + "═".repeat(97));
console.log(`OPERAR · OPCIONES 0DTE de SPXW sobre los niveles de GEX`);
console.log(`${CACHE.length} días de cadena · niveles con el OI del día ANTERIOR · entrada 09:35`);
console.log(`${PRUEBAS_DECLARADAS} pruebas declaradas → listón |t| ≥ ${LISTON}`);
console.log("═".repeat(97));

// ═══ 0 · VALIDACIÓN de la caché contra los niveles ══════════════════════════════════════════
console.log(`\n## 0 · VALIDACIÓN — la caché de la cadena contra scripts/gex-niveles.json\n`);
{
  let n = 0, dAp = [], dCi = [], sinNiv = 0;
  for (const d of CACHE) {
    const f = nivPorFecha.get(d.f); if (!f) { sinNiv++; continue; }
    n++; dAp.push(Math.abs(d.S[0] - f.apertura)); dCi.push(Math.abs(d.S[d.S.length - 1] - f.cierre));
  }
  console.log(`   días cruzados ${n} · sin fila de niveles ${sinNiv}`);
  console.log(`   |apertura caché − apertura niveles|: p50 ${f2(med(dAp))} · p99 ${f2(pctl(dAp, 99))} pts`);
  console.log(`   |cierre  caché − cierre  niveles|: p50 ${f2(med(dCi))} · p99 ${f2(pctl(dCi, 99))} pts`);
  exigir(med(dAp) < 0.5 && med(dCi) < 0.5, "la caché no cuadra con los niveles");
  const prim = CACHE[0].ts[0], ult = CACHE[0].ts[CACHE[0].ts.length - 1];
  console.log(`   primer sello ${prim} · último ${ult}  (las 09:30 se descartan: subyacente = 0)`);
  exigir(prim === "09:35", `el primer sello no es 09:35 sino ${prim}`);
  // ask ≥ bid y campos vivos
  let malos = 0, vivos = 0;
  for (const d of CACHE) for (let i = 0; i < d.K.length; i++) for (let j = 0; j < d.ts.length; j++) {
    if (d.cb[i][j] >= 0 && d.ca[i][j] >= 0) { vivos++; if (d.ca[i][j] < d.cb[i][j]) malos++; }
  }
  console.log(`   cotizaciones call vivas ${f0(vivos)} · con ask < bid ${malos}`);
  exigir(malos / vivos < 0.001, "demasiadas cotizaciones invertidas");
}

// ── índices de ayuda ───────────────────────────────────────────────────────────────────────
const idxTs = (d, hh) => d.ts.indexOf(hh);
const iK = (d, obj) => { let b = -1, mejor = Infinity; for (let i = 0; i < d.K.length; i++) { const x = Math.abs(d.K[i] - obj); if (x < mejor) { mejor = x; b = i; } } return b; };
const Q = (d, lado, i, j, cual) => { const A = lado > 0 ? (cual === "b" ? d.cb : d.ca) : (cual === "b" ? d.pb : d.pa); const v = A[i]?.[j]; return v >= 0 ? v : NaN; };

// ═══ CONSTRUIR LAS OPERACIONES ══════════════════════════════════════════════════════════════
// lado: +1 compra CALL (esperamos subida) · −1 compra PUT (esperamos bajada)
// objetivo: el nivel al que se apunta (para la salida "tocar el nivel")
function operar(d, lado, objetivo, vehiculo, salida) {
  const j0 = 0;                                    // 09:35
  const S0 = d.S[j0], Sfin = d.S[d.S.length - 1];
  if (!(S0 > 0) || !(Sfin > 0)) return { fuera: "subyacente muerto" };

  // strikes
  const iLargo = vehiculo === "ATM" || vehiculo === "VERT" ? iK(d, S0)
    : vehiculo === "OTM25" ? iK(d, S0 * (1 + lado * 0.0025))
    : iK(d, S0 * (1 + lado * 0.005));
  const iCorto = vehiculo === "VERT" ? iK(d, S0 * (1 + lado * 0.005)) : -1;
  if (iLargo < 0) return { fuera: "sin strike" };
  if (vehiculo === "VERT" && (iCorto < 0 || iCorto === iLargo)) return { fuera: "vertical sin ancho" };

  const Klargo = d.K[iLargo], Kcorto = vehiculo === "VERT" ? d.K[iCorto] : NaN;
  const askL = Q(d, lado, iLargo, j0, "a"), bidL = Q(d, lado, iLargo, j0, "b");
  if (!(askL > 0) || !(bidL >= 0)) return { fuera: "pata larga sin cotización" };

  let debito, ancho = NaN;
  if (vehiculo === "VERT") {
    const bidC = Q(d, lado, iCorto, j0, "b");
    if (!(bidC > 0)) return { fuera: "pata corta sin cotización" };
    ancho = Math.abs(Kcorto - Klargo);
    debito = askL - bidC;                          // peaje entero de las dos patas
    if (!(debito > 0) || debito >= ancho) return { fuera: "débito imposible" };
  } else {
    debito = askL;
  }
  const horquillaEntrada = askL - bidL;

  // ── salida ───────────────────────────────────────────────────────────────────────────────
  let valor, jSal = d.ts.length - 1, tocó = false;
  const intr = (S) => {
    const iL = Math.max(0, lado > 0 ? S - Klargo : Klargo - S);
    if (vehiculo !== "VERT") return iL;
    const iC = Math.max(0, lado > 0 ? S - Kcorto : Kcorto - S);
    return iL - iC;                                // = min(iL, ancho) por construcción
  };
  const venderEn = (j) => {
    const b = Q(d, lado, iLargo, j, "b");
    if (!(b >= 0)) return NaN;
    if (vehiculo !== "VERT") return b;
    const a = Q(d, lado, iCorto, j, "a");          // recomprar la corta al ASK
    if (!(a >= 0)) return NaN;
    return b - a;
  };

  if (salida === "VENC") {
    valor = intr(Sfin);
  } else if (salida === "TOCA") {
    // se sale cuando el subyacente ALCANZA el nivel al que apunta la señal
    for (let j = 1; j < d.ts.length; j++) {
      if ((lado > 0 && d.S[j] >= objetivo) || (lado < 0 && d.S[j] <= objetivo)) {
        const v = venderEn(j); if (Number.isFinite(v)) { valor = v; jSal = j; tocó = true; }
        break;
      }
    }
    if (!tocó) valor = intr(Sfin);                 // si no lo toca, se deja vencer
  } else {
    const j = idxTs(d, salida === "12:00" ? "12:00" : "15:55");
    if (j < 0) return { fuera: "sin sello de salida" };
    valor = venderEn(j); jSal = j;
  }
  if (!Number.isFinite(valor)) return { fuera: "sin cotización de salida" };
  if (vehiculo === "VERT") valor = Math.max(0, Math.min(valor, ancho));
  else valor = Math.max(0, valor);

  return {
    pnl: (valor - debito) * 100, coste: debito * 100, debito, valor, Klargo, Kcorto, ancho,
    horquillaEntrada, horquillaPct: 100 * horquillaEntrada / ((askL + bidL) / 2 || NaN),
    tocó, jSal, S0, Sfin, lado, riesgo: debito * 100,
  };
}

// ═══ SEÑALES ════════════════════════════════════════════════════════════════════════════════
// S1 · imán gamD.imanNeto en días de gamma neta NEGATIVA
// S2 · punto de giro gamD.flip, todos los días
function señal(f, cual) {
  if (cual === "S1") {
    if (!(f.niveles.gam?.netPunto < 0)) return null;
    const K = f.niveles.gamD?.imanNeto; if (!(K > 0)) return null;
    const lado = Math.sign(K - f.apertura); if (!lado) return null;
    return { lado, objetivo: K };
  }
  const K = f.niveles.gamD?.flip; if (!(K > 0)) return null;
  const lado = Math.sign(K - f.apertura); if (!lado) return null;
  return { lado, objetivo: K };
}

const VEHICULOS = [["ATM", "ATM"], ["OTM25", "0,25% fuera"], ["OTM50", "0,5% fuera"], ["VERT", "vertical ATM→0,5%"]];
const SALIDAS = [["VENC", "vencimiento"], ["TOCA", "tocar el nivel"], ["12:00", "12:00"], ["15:55", "15:55"]];

// ═══ 1 · LA REJILLA ═════════════════════════════════════════════════════════════════════════
console.log(`\n## 1 · LA REJILLA — 2 señales × 4 vehículos × 4 salidas, precios reales\n`);
console.log(`   ${"señal".padEnd(6)} ${"vehículo".padEnd(18)} ${"salida".padEnd(15)} ${"n".padStart(5)} ${"coste".padStart(8)} ${"$/op".padStart(9)} ${"t".padStart(7)} ${"$/año".padStart(10)}`);

const resultados = {};
const filasOps = {};
for (const [sid] of [["S1"], ["S2"]]) {
  for (const [vid, vNom] of VEHICULOS) {
    for (const [xid, xNom] of SALIDAS) {
      const ops = [], fuera = {};
      for (const d of CACHE) {
        const f = nivPorFecha.get(d.f); if (!f) continue;
        const s = señal(f, sid); if (!s) continue;
        const o = operar(d, s.lado, s.objetivo, vid, xid);
        if (o.fuera) { fuera[o.fuera] = (fuera[o.fuera] || 0) + 1; continue; }
        ops.push({ ...o, fecha: d.f, ano: +d.f.slice(0, 4) });
      }
      if (ops.length < 100) { console.log(`   ${sid.padEnd(6)} ${vNom.padEnd(18)} ${xNom.padEnd(15)} muestra corta (${ops.length})`); continue; }
      const pnl = ops.map((o) => o.pnl);
      const diasSenal = CACHE.filter((d) => { const f = nivPorFecha.get(d.f); return f && señal(f, sid); }).length;
      const porAno = 252 * (ops.length / CACHE.length);
      const k = `${sid}|${vid}|${xid}`;
      resultados[k] = { n: ops.length, coste: media(ops.map((o) => o.coste)), mediaOp: media(pnl), t: tOf(pnl), anual: media(pnl) * porAno, porAno, diasSenal };
      filasOps[k] = ops;
      console.log(`   ${sid.padEnd(6)} ${vNom.padEnd(18)} ${xNom.padEnd(15)} ${String(ops.length).padStart(5)} ${("$" + f0(media(ops.map((o) => o.coste)))).padStart(8)} ${("$" + f2(media(pnl))).padStart(9)} ${f2(tOf(pnl)).padStart(7)} ${("$" + f0(media(pnl) * porAno)).padStart(10)}`);
    }
  }
  console.log("");
}

// ═══ 2 · EL PEAJE, EN LA MONEDA QUE IMPORTA ═════════════════════════════════════════════════
console.log(`\n## 2 · EL PEAJE — ¿cuánto tiene que moverse el SPX sólo para EMPATAR?\n`);
{
  const base = filasOps["S1|ATM|VENC"] || filasOps["S2|ATM|VENC"];
  exigir(base, "no hay operaciones ATM para medir el peaje");
  for (const [vid, vNom] of VEHICULOS) {
    const ops = filasOps[`S1|${vid}|VENC`]; if (!ops) continue;
    // punto muerto exacto al vencimiento: cuánto tiene que moverse el índice desde 09:35
    const pm = ops.map((o) => {
      const be = o.lado > 0 ? o.Klargo + o.debito : o.Klargo - o.debito;   // largo simple
      return vid === "VERT" ? Math.abs((o.Klargo + o.lado * o.debito) - o.S0) : Math.abs(be - o.S0);
    });
    const dist = ops.map((o) => Math.abs(o.Sfin - o.S0));
    console.log(`   ${vNom.padEnd(18)} coste $${f0(media(ops.map((o) => o.coste))).padStart(6)} · horquilla de entrada ${f2(med(ops.map((o) => o.horquillaPct)))}% de la prima`);
    console.log(`   ${"".padEnd(18)} PUNTO MUERTO al vencimiento: ${f2(med(pm))} pts SPX (${f2(100 * med(pm) / med(ops.map((o) => o.S0)))}% del índice)`);
    console.log(`   ${"".padEnd(18)} el índice se mueve de verdad (|cierre−09:35|): p50 ${f2(med(dist))} pts · gana el ${(100 * ops.filter((o) => o.pnl > 0).length / ops.length).toFixed(1)}%`);
  }
  // lo que el NIVEL promete
  const prom = [];
  for (const d of CACHE) { const f = nivPorFecha.get(d.f); if (!f) continue; const s = señal(f, "S1"); if (!s) continue; prom.push(Math.abs(s.objetivo - f.apertura)); }
  console.log(`\n   lo que el NIVEL promete (distancia de la apertura al imán): p50 ${f2(med(prom))} pts · p25 ${f2(pctl(prom, 25))} · p75 ${f2(pctl(prom, 75))}`);
}

// ═══ 3 · EL CRUCE ═══════════════════════════════════════════════════════════════════════════
console.log(`\n\n## 3 · EL CRUCE — 2022-2023 (A) contra 2024-2026 (B)\n`);
console.log(`   ${"prueba".padEnd(28)} ${"nA".padStart(5)} ${"$/op A".padStart(9)} ${"tA".padStart(6)} ${"nB".padStart(5)} ${"$/op B".padStart(9)} ${"tB".padStart(6)}  mismo signo`);
const cruces = {};
for (const k of Object.keys(filasOps)) {
  const ops = filasOps[k];
  const A = ops.filter((o) => o.ano <= 2023).map((o) => o.pnl), B = ops.filter((o) => o.ano >= 2024).map((o) => o.pnl);
  if (A.length < 50 || B.length < 50) continue;
  const ms = Math.sign(media(A)) === Math.sign(media(B));
  cruces[k] = { nA: A.length, mA: media(A), tA: tOf(A), nB: B.length, mB: media(B), tB: tOf(B), mismoSigno: ms };
  console.log(`   ${k.padEnd(28)} ${String(A.length).padStart(5)} ${("$" + f2(media(A))).padStart(9)} ${f2(tOf(A)).padStart(6)} ${String(B.length).padStart(5)} ${("$" + f2(media(B))).padStart(9)} ${f2(tOf(B)).padStart(6)}  ${ms ? "SÍ" : "no"}`);
}

writeFileSync("scripts/opc-2-resultado.json", JSON.stringify({ generado: new Date().toISOString(), liston: LISTON, pruebas: PRUEBAS_DECLARADAS, cuenta: CUENTA, resultados, cruces }, null, 1), "utf8");
console.log(`\n   escrito scripts/opc-2-resultado.json`);
console.log("\n" + "═".repeat(97) + "\n");
