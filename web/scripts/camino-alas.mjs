// CAMINO · PASO 5 — si el camino no deja frenar, ¿qué queda? EL ANCHO DEL ALA.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/camino-alas.mjs
//
// El paso 4 cerró la puerta de la gestión intradía: en 29 de 30 estados salir cuesta más que
// aguantar, y los dos períodos no coinciden en NI UNA casilla. Si la cola no se puede evitar con
// información, sólo queda no firmarla: el ala es el techo de la pérdida y se elige ANTES de entrar,
// a las 11:00, sin mirar nada. Eso no es un pronóstico, es una decisión de contabilidad.
//
// El cuello de botella de Lester es el EFECTIVO ($7.977), no el colateral. Con alas de 50 el peor
// día se lleva $4.940 — el 62% de su caja. Aquí se mide qué pasa al estrecharlas, en los dos
// períodos por separado, con precios reales en las cuatro patas.
//
// Primera vez que se corre: construye scripts/camino-alas-11.json (la cadena de las 11:00 de cada
// día). Después lo reutiliza.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT, tWelch } from "../lib/barreraHallazgos";
import { media, pct, eur, peorRacha, periodo, P1, P2, COMM, PATAS, EFECTIVO } from "./camino-lib.mjs";

const DIR = "scripts/cache-theta/gex-2026", CACHE = "scripts/camino-alas-11.json";
const HORA = "11:00", DIST = 25, VENTANA = 160;

function construir() {
  const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
  const out = {};
  const t0 = Date.now();
  for (let i = 0; i < fechas.length; i++) {
    const fecha = fechas[i];
    if (i % 100 === 0) console.log(`   ${i}/${fechas.length} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    const lados = {};
    let cierre = 0, s11 = 0, ok = true;
    for (const R of ["C", "P"]) {
      const p = `${DIR}/iv_${fecha}_${R}.csv`;
      if (!existsSync(p)) { ok = false; break; }
      const lin = readFileSync(p, "utf8").split("\n");
      const cab = lin[0].split(",");
      if (cab[2] !== "strike" || cab[5] !== "bid" || cab[9] !== "ask") throw new Error(`columnas raras en ${p}`);
      const filas = [];
      let hUlt = "";
      for (let j = 1; j < lin.length; j++) {
        const L = lin[j];
        if (L.length < 30) continue;
        const q = L.lastIndexOf(",");
        const up = Number(L.slice(q + 1));
        if (!(up > 0)) continue;
        const h = L.slice(L.lastIndexOf(",", q - 1) + 12, L.lastIndexOf(",", q - 1) + 17);
        if (h >= hUlt) { hUlt = h; cierre = up; }
        if (h !== HORA) continue;
        s11 = up;
        const c = L.split(",");
        const K = Number(c[2]), bid = Number(c[5]), ask = Number(c[9]);
        if (K > 0 && bid >= 0 && ask > 0 && Math.abs(K - up) <= VENTANA) filas.push([K, bid, ask]);
      }
      lados[R] = filas;
    }
    if (!ok || !s11 || !cierre || !lados.C?.length || !lados.P?.length) continue;
    out[fecha] = { s11, cierre, C: lados.C, P: lados.P };
  }
  writeFileSync(CACHE, JSON.stringify(out), "utf8");
  console.log(`   guardado ${CACHE} · ${Object.keys(out).length} días · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  return out;
}

const crudo = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : construir();
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b[0] - o) < Math.abs(a[0] - o) ? b : a));

/** Construye el cóndor de un día con un ancho de ala dado. null si no hay strikes. */
function condor(d, ala) {
  const cC = cerca(d.C, d.s11 + DIST), pC = cerca(d.P, d.s11 - DIST);
  const cL = cerca(d.C, cC[0] + ala), pL = cerca(d.P, pC[0] - ala);
  if (cL[0] <= cC[0] || pL[0] >= pC[0]) return null;
  const cred = cC[1] + pC[1] - cL[2] - pL[2];
  if (!(cred > 0)) return null;
  const S = d.cierre;
  const perdC = Math.min(Math.max(S - cC[0], 0), cL[0] - cC[0]);
  const perdP = Math.min(Math.max(pC[0] - S, 0), pC[0] - pL[0]);
  return {
    cred, pl: (cred - perdC - perdP) * 100 - PATAS * COMM,
    anchoReal: Math.max(cL[0] - cC[0], pC[0] - pL[0]),
    ladoC: perdC > 0, ladoP: perdP > 0,
  };
}

const ANCHOS = [10, 15, 20, 25, 30, 40, 50];
const fechas = Object.keys(crudo).sort();
const tabla = {};
for (const ala of ANCHOS) {
  const filas = [];
  for (const f of fechas) {
    const c = condor(crudo[f], ala);
    if (c) filas.push({ fecha: f, ticker: "SPXW", ...c, pnl: c.pl });
  }
  tabla[ala] = filas;
}
// anchoReal NO va a la radiografía: es una constante por construcción (el ala pedida), y el
// guardián la tumba con razón — un campo de 2 valores no ordena nada. Se enseña aparte, que para
// eso sirve: comprobar que el strike que se compra está donde se pidió y no donde había hueco.
radiografia(tabla[50], ["pl", "cred"], "alas de 50");
radiografia(tabla[15], ["pl", "cred"], "alas de 15");
for (const ala of [10, 15, 25, 50]) {
  const c = {};
  for (const x of tabla[ala]) c[x.anchoReal] = (c[x.anchoReal] ?? 0) + 1;
  console.log(`  ala pedida ${ala} → anchos reales conseguidos: ${JSON.stringify(c)}`);
}

const metricas = (p) => ({
  n: p.length, total: p.reduce((a, x) => a + x, 0), anual: (p.reduce((a, x) => a + x, 0) / p.length) * 252,
  p1: pct(p, 0.01), p5: pct(p, 0.05), peor: Math.min(...p), racha: peorRacha(p),
  gan: p.filter((x) => x > 0).length / p.length,
});
const sel = (filas, P) => filas.filter((x) => P === "TODO" || periodo(x.fecha) === P);

const PRUEBAS = ANCHOS.length * 2;
console.log(`\n## ${ANCHOS.length} anchos × 2 períodos = ${PRUEBAS} pruebas · listón |t| = ${listonT(PRUEBAS)}`);

console.log(`\n\n═══ 1 · EL ANCHO DEL ALA, EN LOS DOS PERÍODOS (1 contrato, precios reales) ═══\n`);
console.log("| ala | colateral | crédito medio | 22-23 $/año | peor día | racha | 24-26 $/año | peor día | racha | TODO $/año | peor día | p1 | p5 | racha |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const ala of ANCHOS) {
  const f = tabla[ala];
  const a = metricas(sel(f, P1).map((x) => x.pl)), b = metricas(sel(f, P2).map((x) => x.pl)), t = metricas(f.map((x) => x.pl));
  console.log(`| ${ala} pts | ${eur(ala * 100)} | $${media(f.map((x) => x.cred)).toFixed(2)} | ${eur(a.anual)} | ${eur(a.peor)} | ${eur(a.racha)} | ${eur(b.anual)} | ${eur(b.peor)} | ${eur(b.racha)} | ${eur(t.anual)} | ${eur(t.peor)} | ${eur(t.p1)} | ${eur(t.p5)} | ${eur(t.racha)} |`);
}

console.log(`\n\n═══ 2 · A IGUAL RIESGO — cuántos contratos caben y cuánto dan ═══`);
console.log(`\nEl límite es el EFECTIVO ($${EFECTIVO.toLocaleString("es-ES")}): las pérdidas salen de ahí. Se pide que la PEOR RACHA de los`);
console.log(`4,5 años quepa en el efectivo, y que el colateral quepa en el poder de compra ($73.874).\n`);
console.log("| ala | peor racha/contrato | contratos que aguanta el efectivo | colateral usado | $/año a ese tamaño | peor día a ese tamaño |");
console.log("|---|---|---|---|---|---|");
for (const ala of ANCHOS) {
  const t = metricas(tabla[ala].map((x) => x.pl));
  const nCaja = Math.floor(EFECTIVO / Math.abs(t.racha));
  const nBP = Math.floor(73874 / (ala * 100));
  const n = Math.max(0, Math.min(nCaja, nBP));
  console.log(`| ${ala} pts | ${eur(t.racha)} | ${n} | ${eur(n * ala * 100)} | ${n ? eur(t.anual * n) : "no cabe ni 1"} | ${n ? eur(t.peor * n) : "—"} |`);
}

console.log(`\n\n═══ 3 · EL CRUCE DEL ANCHO ═══`);
console.log(`\nSe elige el ancho que más deja en un período y se aplica al otro. Y el que mejor relación`);
console.log(`$/año por dólar de peor racha deja, también cruzado.\n`);
for (const [aj, pb] of [[P1, P2], [P2, P1]]) {
  const mejorDinero = ANCHOS.reduce((x, y) => (metricas(sel(tabla[x], aj).map((z) => z.pl)).anual >= metricas(sel(tabla[y], aj).map((z) => z.pl)).anual ? x : y));
  const mejorRatio = ANCHOS.reduce((x, y) => {
    const r = (a) => { const m = metricas(sel(tabla[a], aj).map((z) => z.pl)); return m.anual / Math.abs(m.racha); };
    return r(x) >= r(y) ? x : y;
  });
  for (const [crit, ala] of [["más $/año", mejorDinero], ["mejor $/año por $ de racha", mejorRatio]]) {
    const a = metricas(sel(tabla[ala], aj).map((z) => z.pl)), b = metricas(sel(tabla[ala], pb).map((z) => z.pl));
    console.log(`  elegido en ${aj} por "${crit}" → ala de ${ala}`);
    console.log(`     ${aj}: ${eur(a.anual)}/año · peor ${eur(a.peor)} · racha ${eur(a.racha)}`);
    console.log(`     ${pb}: ${eur(b.anual)}/año · peor ${eur(b.peor)} · racha ${eur(b.racha)}   ← fuera de muestra`);
  }
}

console.log(`\n\n═══ 4 · ¿DE QUÉ LADO VIENE EL DAÑO? (ala de 50) ═══\n`);
console.log("| período | días con pérdida | rotos por el lado PUT | rotos por el lado CALL | pérdida por put | pérdida por call |");
console.log("|---|---|---|---|---|---|");
for (const P of [P1, P2, "TODO"]) {
  const f = sel(tabla[50], P).filter((x) => x.pl < 0);
  const put = f.filter((x) => x.ladoP), call = f.filter((x) => x.ladoC);
  console.log(`| ${P} | ${f.length} | ${put.length} | ${call.length} | ${eur(put.reduce((a, x) => a + x.pl, 0))} | ${eur(call.reduce((a, x) => a + x.pl, 0))} |`);
}

console.log(`\n\n═══ 5 · LA CUENTA EN DÓLARES AL AÑO SOBRE $56.389 ═══\n`);
console.log("| estrategia | contratos | $/año | % de la cuenta | peor día | % del efectivo que se lleva |");
console.log("|---|---|---|---|---|---|");
for (const ala of ANCHOS) {
  const t = metricas(tabla[ala].map((x) => x.pl));
  const n = Math.max(1, Math.min(Math.floor(EFECTIVO / Math.abs(t.racha)), Math.floor(73874 / (ala * 100))));
  console.log(`| cóndor ±25 con ala de ${ala} | ${n} | ${eur(t.anual * n)} | ${((t.anual * n / 56389) * 100).toFixed(1)}% | ${eur(t.peor * n)} | ${((Math.abs(t.peor * n) / EFECTIVO) * 100).toFixed(0)}% |`);
}
const t50 = tabla[50].map((x) => x.pl), t15 = tabla[15].map((x) => x.pl);
console.log(`\n  t de Welch entre el P&L diario del ala de 15 y el de 50: ${tWelch(t15, t50).toFixed(2)} (listón ${listonT(PRUEBAS)})`);
