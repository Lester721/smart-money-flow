// ¿ERA UNA SEÑAL O ERA LA HORQUILLA? — la prueba que decide.
//
// ═══ LO QUE SE DESTAPÓ ══════════════════════════════════════════════════════════════════════
//
// "Prima lejos del dinero" separaba +8,1% (t 2,34). Pero al mirar QUÉ elige, SPY y QQQ salen en
// el tercio ALTO. SPY es de lo menos volátil que existe. Si la métrica midiera riqueza de prima,
// SPY estaría abajo.
//
// Está arriba porque la métrica SUMA primas, y la cadena de SPY lista cientos de strikes mientras
// un nombre mediano lista treinta. No mide riqueza: mide **cuántos contratos tiene la cadena** —
// o sea, tamaño y liquidez.
//
// Y ahí está la sospecha que hay que matar o confirmar: los nombres grandes tienen la horquilla
// estrecha y los pequeños la tienen ancha. Comprar y vender 23 días después paga esa horquilla
// DOS VECES. Si el tercio alto paga un 4% de peaje y el bajo un 12%, ahí están 8 puntos —
// exactamente lo que "separa" la señal.
//
// ═══ LAS TRES MEDIDAS QUE LO RESUELVEN ══════════════════════════════════════════════════════
//
//  1. ¿cuánto de la métrica es simple RECUENTO DE STRIKES? (correlación)
//  2. ¿cuánta horquilla paga cada tercio? — si la brecha explica el 8,1%, se acabó
//  3. la misma señal MEDIDA EN PUNTO MEDIO (sin peaje): si ahí desaparece, era el peaje;
//     si ahí sigue, la señal es real y el peaje sólo la tapaba
//
// La 3 es la que decide de verdad, y es simétrica: sirve tanto para matarla como para salvarla.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/prima-lejos-o-liquidez.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const PANEL = "scripts/cache-theta/panel-liquidez.json";
const OTM = 5, DTE_OBJ = 90, DTE_TOL = 25, SALIR = 23, ASK_MIN = 0.10;

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tDe = (v) => media(v) / (sd(v) / Math.sqrt(v.length));
const pct = (x) => (x * 100).toFixed(1) + "%";
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const corr = (a, b) => {
  const ma = media(a), mb = media(b);
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? n / Math.sqrt(da * db) : NaN;
};

let filas;
if (existsSync(PANEL)) {
  filas = JSON.parse(readFileSync(PANEL, "utf8"));
  console.log(`\n## Panel leído de disco · ${filas.length} filas\n`);
} else {
  const diasPorSim = new Map();
  for (const f of readdirSync(CDIR)) {
    const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
    if (!m) continue;
    if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
    diasPorSim.get(m[1]).push(m[2]);
  }
  for (const v of diasPorSim.values()) v.sort();
  const TICKERS = [...diasPorSim.keys()].sort();

  const cache = new Map();
  const cadena = (sym, dia) => {
    const k = `${sym}|${dia}`;
    if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
    const f = `${CDIR}/${sym}_d${dia}.json`;
    const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
    cache.set(k, v); if (cache.size > 200) cache.delete(cache.keys().next().value);
    return v;
  };
  const spotDe = (c) => {
    let k = null, dm = Infinity;
    for (const g of Object.values(c)) for (const [cl, ba] of Object.entries(g)) {
      if (cl.slice(-1) !== "C") continue;
      const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`];
      if (!p) continue;
      const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
      if (d < dm) { dm = d; k = K; }
    }
    return k;
  };
  /** Devuelve la pata con TODO lo que hace falta para separar señal de peaje. */
  const pata = (sym, dia, tipo, dias) => {
    const c = cadena(sym, dia); if (!c) return null;
    const sp = spotDe(c); if (!sp) return null;
    const i = dias.indexOf(dia); if (i < 0 || i + SALIR >= dias.length) return null;
    const obj = tipo === "C" ? sp * (1 + OTM / 100) : sp * (1 - OTM / 100);
    let mejor = null, mejorD = Infinity;
    for (const [exp, g] of Object.entries(c)) {
      const dte = Math.round((ms(exp) - ms(dia)) / 86_400_000);
      if (Math.abs(dte - DTE_OBJ) > DTE_TOL) continue;
      for (const [clave, ba] of Object.entries(g)) {
        if (clave.slice(-1) !== tipo) continue;
        if (!(ba[1] >= ASK_MIN)) continue;
        const d = Math.abs(Number(clave.slice(0, -2)) - obj) / sp + Math.abs(dte - DTE_OBJ) / 1000;
        if (d < mejorD) { mejorD = d; mejor = { exp, clave, bid: ba[0], ask: ba[1] }; }
      }
    }
    if (!mejor) return null;
    const gSal = cadena(sym, dias[i + SALIR])?.[mejor.exp]?.[mejor.clave];
    const bidSal = gSal?.[0] ?? 0, askSal = gSal?.[1] ?? 0;
    const medioEnt = (mejor.bid + mejor.ask) / 2, medioSal = (bidSal + askSal) / 2;
    return {
      real: (bidSal - mejor.ask) / mejor.ask,                        // como se opera de verdad
      medio: medioEnt > 0 ? (medioSal - medioEnt) / medioEnt : null, // sin peaje: sólo el movimiento
      horquilla: (mejor.ask - mejor.bid) / mejor.ask,
      prima: mejor.ask,
    };
  };

  console.log(`\n## Construyendo el panel con horquilla y punto medio · ${TICKERS.length} tickers\n`);
  filas = [];
  for (const sym of TICKERS) {
    const dias = diasPorSim.get(sym); const vistos = new Set();
    for (const d of dias) {
      const mes = d.slice(0, 6); if (vistos.has(mes)) continue; vistos.add(mes);
      const c = cadena(sym, d); if (!c) continue;
      const sp = spotDe(c); if (!sp) continue;
      let lejos = 0, nStrikes = 0, nLejos = 0;
      const vistosK = new Set();
      for (const [exp, g] of Object.entries(c)) {
        const dte = Math.round((ms(exp) - ms(d)) / 86_400_000);
        if (dte < 5) continue;
        for (const [clave, ba] of Object.entries(g)) {
          const K = Number(clave.slice(0, -2));
          const dist = (K - sp) / sp;
          const mid = (ba[0] + ba[1]) / 2; if (!(mid > 0)) continue;
          nStrikes++; vistosK.add(K);
          if (Math.abs(dist) > 0.10) { lejos += mid; nLejos++; }
        }
      }
      const C = pata(sym, d, "C", dias), P = pata(sym, d, "P", dias);
      if (!C || !P || C.medio == null || P.medio == null) continue;
      filas.push({
        sym, mes,
        primaLejos: lejos / sp,
        nStrikes, nLejos, strikesDistintos: vistosK.size,
        conoReal: (C.real + P.real) / 2,
        conoMedio: (C.medio + P.medio) / 2,
        horquilla: (C.horquilla + P.horquilla) / 2,
        primaUSD: (C.prima + P.prima) * 100,        // lo que cuesta el cono, un contrato de cada
      });
    }
    process.stdout.write(`\r   ${sym} · ${filas.length} filas   `);
  }
  writeFileSync(PANEL, JSON.stringify(filas), "utf8");
  console.log(`\n\n${filas.length} filas guardadas\n`);
}

// ── 1. ¿es la métrica un recuento de strikes disfrazado? ────────────────────
console.log("=".repeat(80));
console.log("  1. ¿QUÉ MIDE DE VERDAD LA MÉTRICA?");
console.log("=".repeat(80) + "\n");
console.log(`  correlación de "prima lejos" con el número de contratos de la cadena: **${corr(filas.map((f) => f.primaLejos), filas.map((f) => f.nStrikes)).toFixed(3)}**`);
console.log(`  correlación con el número de strikes distintos:                       ${corr(filas.map((f) => f.primaLejos), filas.map((f) => f.strikesDistintos)).toFixed(3)}`);
console.log(`  correlación con la horquilla que se paga:                             ${corr(filas.map((f) => f.primaLejos), filas.map((f) => f.horquilla)).toFixed(3)}\n`);

// ── 2. ¿cuánta horquilla paga cada tercio? ─────────────────────────────────
function tercios(campo) {
  const porMes = new Map();
  for (const f of filas) { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(f); }
  const alto = [], bajo = [];
  for (const g of porMes.values()) {
    if (g.length < 6) continue;
    const o = [...g].sort((a, b) => b[campo] - a[campo]); const k = Math.floor(o.length / 3);
    alto.push(...o.slice(0, k)); bajo.push(...o.slice(-k));
  }
  return { alto, bajo };
}
const { alto, bajo } = tercios("primaLejos");
console.log("=".repeat(80));
console.log("  2. LA HORQUILLA DE CADA TERCIO");
console.log("=".repeat(80) + "\n");
console.log("| tercio | n | horquilla media | coste del cono | retorno REAL | retorno a PUNTO MEDIO |");
console.log("|---|---|---|---|---|---|");
for (const [nom, g] of [["alto (mucha prima lejos)", alto], ["bajo (poca)", bajo]]) {
  console.log(`| ${nom} | ${g.length} | ${pct(media(g.map((x) => x.horquilla)))} | $${Math.round(media(g.map((x) => x.primaUSD)))} | ${pct(media(g.map((x) => x.conoReal)))} | ${pct(media(g.map((x) => x.conoMedio)))} |`);
}
const brecha = media(alto.map((x) => x.horquilla)) - media(bajo.map((x) => x.horquilla));
console.log(`\n  brecha de horquilla entre tercios: **${pct(-brecha)}** a favor del tercio alto (se paga dos veces: ~${pct(-brecha * 2)})`);

// ── 3. LA PRUEBA QUE DECIDE: la señal medida a punto medio ─────────────────
function serie(campo, veh) {
  const porMes = new Map();
  for (const f of filas) { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(f); }
  const out = [];
  for (const [mes, g] of [...porMes].sort()) {
    if (g.length < 6) continue;
    const o = [...g].sort((a, b) => b[campo] - a[campo]); const k = Math.floor(o.length / 3);
    out.push(media(o.slice(0, k).map((x) => x[veh])) - media(o.slice(-k).map((x) => x[veh])));
  }
  return out;
}
console.log("\n" + "=".repeat(80));
console.log("  3. LA MISMA SEÑAL, CON Y SIN PEAJE");
console.log("=".repeat(80) + "\n");
console.log("| medida | n meses | separación | t honesto |");
console.log("|---|---|---|---|");
for (const [veh, nom] of [["conoReal", "como se opera (bid/ask)"], ["conoMedio", "a punto medio (sin peaje)"]]) {
  const d = serie("primaLejos", veh);
  console.log(`| ${nom} | ${d.length} | ${pct(media(d))} | **${tDe(d).toFixed(2)}** |`);
}

const real = media(serie("primaLejos", "conoReal")), medio = media(serie("primaLejos", "conoMedio"));
console.log("\n" + "=".repeat(80));
if (Math.abs(medio) < 0.02) {
  console.log(`  🔴 ERA EL PEAJE. A punto medio la señal cae a ${pct(medio)}: lo que separaba no era`);
  console.log(`     el movimiento del subyacente, era la diferencia de horquilla entre nombres`);
  console.log(`     grandes y pequeños. Eso ya lo sabíamos y se llama mapa de liquidez.`);
} else if (Math.abs(medio) > Math.abs(real) * 0.6) {
  console.log(`  🟢 NO ERA EL PEAJE. A punto medio sigue separando ${pct(medio)} de ${pct(real)}:`);
  console.log(`     el tercio alto SE MUEVE más de lo que cuesta. Eso es señal, no liquidez.`);
} else {
  console.log(`  🟡 MITAD Y MITAD. Real ${pct(real)}, a punto medio ${pct(medio)}: parte es peaje`);
  console.log(`     y parte es movimiento. Hay que ver si lo que queda paga la ejecución.`);
}
console.log("=".repeat(80) + "\n");
