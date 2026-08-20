// ═══════════════════════════════════════════════════════════════════════════════════════════
// ¿CUÁNTO DOMINA EL MURO?  —  el ingrediente que la definición actual tira a la basura.
//
// `gex-niveles.json` guarda el ARGMAX: el strike con más gamma. Pero un argmax no dice nada de
// si hay muro. Si la gamma está repartida entre veinte strikes, el "muro" es el que sacó 6% en
// vez de 5%: ruido con nombre. Si un solo strike se lleva el 40%, eso sí es una pared.
//
// La medición de respetar salió plana contra el azar. Antes de cerrarla hay que preguntar si el
// fallo es de la HIPÓTESIS o de la DEFINICIÓN. Así que se recalcula el perfil de gamma de cada
// día y se guarda cuánto pesa el muro dentro de su propio lado:
//
//   cuota1   la parte del muro sobre la gamma TOTAL de ese lado          (0 = plano, 1 = un pico)
//   cuota3   la parte de los tres strikes mayores
//   sobre2   cuántas veces el muro es mayor que el segundo               (1 = empate, 2 = doble)
//   hhi      Herfindahl del perfil: Σ cuota²  ·  1/hhi = "strikes efectivos"
//
// Mismos ingredientes exactos que el constructor: OI de la mañana (cierre de AYER), IV REAL de
// la barra de 09:35, Black-Scholes SÓLO para la griega. Se comprueba contra gex-niveles.json que
// el muro recalculado sea EL MISMO strike — si no cuadra, lanza.
//
// Salida: scripts/muros-concentracion.json
// Uso:    node --import tsx --max-old-space-size=10240 scripts/muros-concentracion.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const SALIDA = "scripts/muros-concentracion.json";
const HORA = "T09:35:00";
const T_REAL = (6 + 25 / 60) / 24 / 365;
const T_DIA = 1 / 365;
const BANDA_GAMMA = 0.10;
const BANDA_OI = 0.05;

const phi = (x) => 0.3989422804014327 * Math.exp((-x * x) / 2);
function gammaBS(S, K, t, v) {
  const st = v * Math.sqrt(t);
  if (!(st > 0) || !(S > 0) || !(K > 0)) return 0;
  const d1 = (Math.log(S / K) + (v * v / 2) * t) / st;
  const g = phi(d1) / (S * st);
  return Number.isFinite(g) ? g : 0;
}
function columnas(cabecera, pedidas, fichero) {
  const cab = cabecera.split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = {}; const faltan = [];
  for (const p of pedidas) { const i = cab.indexOf(p); if (i < 0) faltan.push(p); idx[p] = i; }
  if (faltan.length) throw new Error(`${fichero}: faltan columnas [${faltan.join(", ")}]`);
  return idx;
}

/** Foto de las 09:35: strike → iv. Sólo se parten las líneas de esa barra. */
function foto09(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const txt = readFileSync(f, "utf8");
  const nl = txt.indexOf("\n"); if (nl < 0) return null;
  const I = columnas(txt.slice(0, nl), ["strike", "timestamp", "implied_vol", "underlying_price"], f);
  const m = new Map(); let spot = 0;
  const lin = txt.split("\n");
  for (let j = 1; j < lin.length; j++) {
    const l = lin[j];
    if (l.length < 20 || l.indexOf(HORA) < 0) continue;
    const c = l.split(",");
    if (c[I.timestamp].indexOf(HORA) < 0) continue;
    const sp = +c[I.underlying_price]; if (sp > 0 && !spot) spot = sp;
    m.set(+c[I.strike], +c[I.implied_vol]);
  }
  return { m, spot };
}

function leerOI(fecha) {
  const f = `${DIR}/oi_${fecha}.csv`;
  if (!existsSync(f)) return null;
  const txt = readFileSync(f, "utf8");
  const nl = txt.indexOf("\n"); if (nl < 0) return null;
  const I = columnas(txt.slice(0, nl), ["strike", "right", "timestamp", "open_interest"], f);
  const C = new Map(), P = new Map();
  const lin = txt.split("\n");
  for (let j = 1; j < lin.length; j++) {
    const l = lin[j]; if (l.length < 10) continue;
    const c = l.split(",");
    const ts = c[I.timestamp];
    if (ts.slice(0, 10) !== fecha) continue;
    if (ts.slice(11, 16) >= "09:30") continue;          // nada del futuro
    const v = +c[I.open_interest]; if (!(v > 0)) continue;
    (c[I.right].replace(/"/g, "") === "CALL" ? C : P).set(+c[I.strike], v);
  }
  return C.size + P.size >= 20 ? { C, P } : null;
}

/** cuota1 / cuota3 / sobre2 / hhi de un vector de pesos ≥ 0. */
function concentracion(pesos) {
  const v = pesos.filter((x) => x > 0).sort((a, b) => b - a);
  const tot = v.reduce((a, x) => a + x, 0);
  if (!(tot > 0) || v.length < 2) return null;
  const hhi = v.reduce((a, x) => a + (x / tot) ** 2, 0);
  return {
    cuota1: +(v[0] / tot).toFixed(4),
    cuota3: +((v[0] + (v[1] || 0) + (v[2] || 0)) / tot).toFixed(4),
    sobre2: +(v[0] / v[1]).toFixed(3),
    efectivos: +(1 / hhi).toFixed(2),
    nStrikes: v.length,
  };
}

const N = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
console.log(`\n## CONCENTRACIÓN DEL MURO · ${N.filas.length} días\n`);

const out = {};
let malMuro = 0, sinDatos = 0;
const ejemplos = [];
const t0 = Date.now();
for (let i = 0; i < N.filas.length; i++) {
  const f = N.filas[i];
  if (i % 150 === 0) console.log(`  ${String(i).padStart(4)}/${N.filas.length} · ${f.fecha} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  const C = foto09(f.fecha, "C"), P = foto09(f.fecha, "P"), oi = leerOI(f.fecha);
  if (!C || !P || !oi) { sinDatos++; continue; }
  const spot = C.spot || P.spot;
  if (!(spot > 0)) { sinDatos++; continue; }

  const perfil = [];
  for (const K of new Set([...oi.C.keys(), ...oi.P.keys()])) {
    if (!(K > 0) || Math.abs(K - spot) / spot > BANDA_GAMMA) continue;
    const ivC = C.m.get(K), ivP = P.m.get(K);
    const vC = ivC > 0.02 && ivC < 3 ? ivC : null;
    const vP = ivP > 0.02 && ivP < 3 ? ivP : null;
    if (vC === null && vP === null) continue;
    perfil.push({ K, oiC: oi.C.get(K) || 0, oiP: oi.P.get(K) || 0, ivC: vC, ivP: vP });
  }
  if (perfil.length < 20) { sinDatos++; continue; }

  const fila = {};
  for (const [nombre, t] of [["gam", T_REAL], ["gamD", T_DIA]]) {
    const dC = [], dP = [];
    let argC = null, argP = null, mC = -1, mP = -1;
    for (const p of perfil) {
      const gc = p.ivC !== null ? gammaBS(spot, p.K, t, p.ivC) * p.oiC * 100 * spot * spot * 0.01 : 0;
      const gp = p.ivP !== null ? gammaBS(spot, p.K, t, p.ivP) * p.oiP * 100 * spot * spot * 0.01 : 0;
      dC.push(gc); dP.push(gp);
      if (gc > mC) { mC = gc; argC = p.K; }
      if (gp > mP) { mP = gp; argP = p.K; }
    }
    if (argC !== f.niveles[nombre].muroCall || argP !== f.niveles[nombre].muroPut) { malMuro++; if (ejemplos.length < 5) ejemplos.push(`${f.fecha} ${nombre}: recalculado C=${argC}/P=${argP} vs guardado C=${f.niveles[nombre].muroCall}/P=${f.niveles[nombre].muroPut}`); }
    fila[nombre] = { call: concentracion(dC), put: concentracion(dP) };
  }
  {
    const enB = [];
    for (const K of new Set([...oi.C.keys(), ...oi.P.keys()]))
      if (Math.abs(K - spot) / spot <= BANDA_OI) enB.push({ c: oi.C.get(K) || 0, p: oi.P.get(K) || 0 });
    fila.oi = { call: concentracion(enB.map((x) => x.c)), put: concentracion(enB.map((x) => x.p)) };
  }
  out[f.fecha] = fila;
}
console.log(`  ${N.filas.length}/${N.filas.length} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`\n   días con perfil ....... ${Object.keys(out).length}`);
console.log(`   sin datos ............. ${sinDatos}`);
console.log(`   muro que NO coincide .. ${malMuro}${ejemplos.length ? "\n     " + ejemplos.join("\n     ") : ""}`);
if (malMuro > 0) throw new Error(`FALLO CERRADO: ${malMuro} muros recalculados no coinciden con gex-niveles.json`);

// reparto, para saber si el campo está vivo antes de cribar con él
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.round(q * (s.length - 1))]; };
console.log(`\n   ${"lente".padEnd(6)} ${"lado".padEnd(5)} ${"cuota1 p10".padStart(11)} ${"p50".padStart(7)} ${"p90".padStart(7)}  ${"sobre2 p50".padStart(11)} ${"p90".padStart(7)}  ${"efectivos p50".padStart(14)}`);
for (const L of ["gam", "gamD", "oi"]) for (const lado of ["call", "put"]) {
  const c1 = [], s2 = [], ef = [];
  for (const d of Object.values(out)) { const x = d[L]?.[lado]; if (!x) continue; c1.push(x.cuota1); s2.push(x.sobre2); ef.push(x.efectivos); }
  console.log(`   ${L.padEnd(6)} ${lado.padEnd(5)} ${pct(c1, .1).toFixed(3).padStart(11)} ${pct(c1, .5).toFixed(3).padStart(7)} ${pct(c1, .9).toFixed(3).padStart(7)}  ${pct(s2, .5).toFixed(2).padStart(11)} ${pct(s2, .9).toFixed(2).padStart(7)}  ${pct(ef, .5).toFixed(1).padStart(14)}`);
}
writeFileSync(SALIDA, JSON.stringify(out));
console.log(`\n   escrito ${SALIDA}\n`);
