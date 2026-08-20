// ═══════════════════════════════════════════════════════════════════════════════════════════
// SPY COMO VEHÍCULO DE LOS NIVELES DE GEX — paso 1: MIRAR el dato antes de medir con él.
//
// Lester NO puede comprar SPX. Los niveles de gex-niveles.json están en PUNTOS DE SPX. Este
// paso los pasa a DÓLARES DE SPY, junta el camino minuto a minuto de SPY, y comprueba que el
// dato aguanta antes de que nadie hable de dinero.
//
// LA CONVERSIÓN, dicha explícitamente: SPY se mueve ~1/10 de SPX, pero NO es 10 fijo — la razón
// SPX/SPY va de 10,000 a 10,047 en el período (la deriva vale 25 puntos de SPX, MÁS que la
// distancia mediana al muro). Se usa la razón DEL DÍA:  nivelSPY = nivelSPX / razonSPX,
// con razonSPX = SPX(09:35) / SPY(09:35). Las dos cotizaciones existen a las 09:35: no hay futuro.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/spy-1-radiografia.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { radiografia } from "../lib/radiografia.ts";

const NIV = "scripts/gex-niveles.json";
const DIR = "scripts/cache-theta";
const SALIDA = "scripts/spy-dias.json";
const MIN_ENTRADA = 575;   // 09:35 — el momento de decisión (a las 09:30 la cadena no cotiza)
const MIN_CIERRE = 960;    // 16:00

const J = JSON.parse(readFileSync(NIV, "utf8"));
console.log(`\n╔══ SPY · PASO 1: RADIOGRAFÍA DEL VEHÍCULO ══╗`);
console.log(`  niveles: ${NIV} · generado ${J.generado}`);
console.log(`  ${J.filas.length} días con niveles · decisión a las ${J.hora}\n`);

// ── camino minuto a minuto de SPY ──────────────────────────────────────────────────────────
const spyMin = {};
for (const y of [2022, 2023, 2024, 2025, 2026]) {
  const p = `${DIR}/SPY_spotmin_y_${y}.json`;
  if (!existsSync(p)) { console.log(`  ⚠️  falta ${p}`); continue; }
  Object.assign(spyMin, JSON.parse(readFileSync(p, "utf8")));
}
console.log(`  SPY minuto a minuto: ${Object.keys(spyMin).length} días en caché`);

// ── ¿qué ES el precio de spotmin? Mirado, no supuesto ──────────────────────────────────────
// Sale de underlying_price del endpoint de griegas de ThetaData a interval=1m: es el PUNTO MEDIO
// del NBBO del subyacente en ese minuto, NO un precio de operación. Por eso el peaje se aplica
// aparte y a mano: comprar al ask = medio + 0,005 · vender al bid = medio − 0,005.
const MEDIO_A_LADO = 0.005;   // media horquilla de SPY = medio céntimo

const dias = [];
const descarte = {};
const anota = (k) => { descarte[k] = (descarte[k] || 0) + 1; };

for (const f of J.filas) {
  if (!f.spy) { anota("sin SPY minuto a minuto"); continue; }
  const crudo = spyMin[f.fecha.replace(/-/g, "")];
  if (!crudo || crudo.length < 300) { anota("camino de SPY corto o ausente"); continue; }

  // camino desde 09:35 hasta el cierre, indexado por minuto
  const m = new Map(crudo);
  const camino = [];
  for (let t = MIN_ENTRADA; t <= MIN_CIERRE; t++) { const p = m.get(t); if (p > 0) camino.push([t, p]); }
  if (camino.length < 300) { anota("menos de 300 minutos entre 09:35 y 16:00"); continue; }

  const entrada = camino[0][1];
  const cierre = camino[camino.length - 1][1];
  const razon = f.spy.razonSPX;
  if (!(razon > 9.5 && razon < 10.5)) { anota("razon SPX/SPY fuera de rango"); continue; }
  // COHERENCIA: el precio de SPY a las 09:35 tiene que reproducir el SPX de las 09:35 con la razon
  const reconstruido = entrada * razon;
  if (Math.abs(reconstruido - f.apertura) / f.apertura > 0.001) { anota("SPX(09:35) no cuadra con SPY(09:35) x razon"); continue; }

  const aSPY = (nivelSPX) => (nivelSPX == null ? null : +(nivelSPX / razon).toFixed(3));
  const N = f.niveles;
  const niv = {};
  for (const lente of ["gam", "gamD", "oi"]) {
    niv[lente] = {
      muroCall: aSPY(N[lente].muroCall),
      muroPut: aSPY(N[lente].muroPut),
      imanBruto: aSPY(N[lente].imanBruto),
      imanNeto: aSPY(N[lente].imanNeto ?? null),
      flip: aSPY(N[lente].flip ?? null),
      netPunto: N[lente].netPunto ?? null,
    };
  }
  niv.maxPain = aSPY(f.maxPain);

  let max = -Infinity, min = Infinity;
  for (const [, p] of camino) { if (p > max) max = p; if (p < min) min = p; }

  dias.push({
    fecha: f.fecha, ano: +f.fecha.slice(0, 4), razon,
    entrada: +entrada.toFixed(3), cierre: +cierre.toFixed(3),
    max: +max.toFixed(3), min: +min.toFixed(3),
    movPct: +(((cierre - entrada) / entrada) * 100).toFixed(4),
    rangoPct: +(((max - min) / entrada) * 100).toFixed(4),
    niv, minutos: camino.length,
    camino,   // [[minuto, precio], ...] — el camino REAL del vehículo REAL
  });
}

console.log(`\n── DÍAS OPERABLES ──`);
console.log(`  ${dias.length} de ${J.filas.length} días de niveles tienen vehículo`);
for (const [k, v] of Object.entries(descarte).sort((a, b) => b[1] - a[1])) console.log(`     ${String(v).padStart(4)}  ${k}`);
const porAno = {};
for (const d of dias) porAno[d.ano] = (porAno[d.ano] || 0) + 1;
console.log(`  por año: ${Object.entries(porAno).map(([a, n]) => `${a}:${n}`).join(" · ")}`);
console.log(`  minutos por dia (SALUD, no predictor): ${[...new Set(dias.map((d) => d.minutos))].sort((a, b) => a - b).join(", ")}`);
console.log(`  rango: ${dias[0].fecha} → ${dias[dias.length - 1].fecha}`);

// ── RADIOGRAFÍA: distancias de cada nivel a la entrada, en % ───────────────────────────────
const plano = dias.map((d) => {
  const o = { entrada: d.entrada, movPct: d.movPct, rangoPct: d.rangoPct, razon: d.razon };
  for (const L of ["gam", "gamD", "oi"]) {
    o[`${L}_dCall`] = d.niv[L].muroCall == null ? null : +(((d.niv[L].muroCall - d.entrada) / d.entrada) * 100).toFixed(4);
    o[`${L}_dPut`] = d.niv[L].muroPut == null ? null : +(((d.niv[L].muroPut - d.entrada) / d.entrada) * 100).toFixed(4);
    o[`${L}_dIman`] = d.niv[L].imanBruto == null ? null : +(((d.niv[L].imanBruto - d.entrada) / d.entrada) * 100).toFixed(4);
  }
  o.maxPainPct = d.niv.maxPain == null ? null : +(((d.niv.maxPain - d.entrada) / d.entrada) * 100).toFixed(4);
  return o;
});
try {
  // `minutos` NO entra: es indicador de SALUD (384/385/386), no un predictor. Con 3 valores
  // distintos haria saltar al guardian por la razon contraria a la que existe. Se imprime aparte.
  radiografia(plano, Object.keys(plano[0]), "spy-dias", { cerosLegitimos: ["movPct"] });
  console.log(`  ✅ radiografía LIMPIA.\n`);
} catch (e) { console.log(`\n🔴 ${e.message}\n`); process.exitCode = 1; }

// ── LO QUE DECIDE SI ESTO PUEDE FUNCIONAR: ¿cuánto se mueve SPY y cuánto cuesta el peaje? ──
const P = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const rango$ = dias.map((d) => d.max - d.min);
const dist$ = {};
for (const L of ["gam", "gamD", "oi"]) {
  dist$[L] = dias.map((d) => (d.niv[L].muroCall == null ? null : Math.abs(d.niv[L].muroCall - d.entrada))).filter((x) => x != null);
}
console.log(`── EL PEAJE CONTRA EL RECORRIDO (lo que decide si el vehículo sirve) ──`);
console.log(`  horquilla de SPY: $0,01 (ida y vuelta) sobre un precio p50 de $${P(dias.map((d) => d.entrada), 0.5).toFixed(2)}`);
console.log(`  rango del día en $ de SPY:  p25 $${P(rango$, 0.25).toFixed(2)} · p50 $${P(rango$, 0.5).toFixed(2)} · p75 $${P(rango$, 0.75).toFixed(2)}`);
console.log(`  el peaje se lleva el ${((0.01 / P(rango$, 0.5)) * 100).toFixed(1)}% del rango MEDIANO del día.`);
for (const L of ["gam", "gamD", "oi"])
  console.log(`  distancia al muro de calls (${L}): p50 $${P(dist$[L], 0.5).toFixed(2)} → peaje = ${((0.01 / P(dist$[L], 0.5)) * 100).toFixed(1)}% de ese recorrido`);

// ── ¿toca el precio el muro?  Ahora con el camino REAL de SPY minuto a minuto (no cada 5 min) ─
console.log(`\n── ¿TOCA EL PRECIO CADA NIVEL? (camino real de SPY, 1 min) ──`);
for (const L of ["gam", "gamD", "oi"]) {
  for (const [lado, key, cmp] of [["call", "muroCall", (p, n) => p >= n], ["put", "muroPut", (p, n) => p <= n]]) {
    const validos = dias.filter((d) => d.niv[L][key] != null && (lado === "call" ? d.niv[L][key] > d.entrada : d.niv[L][key] < d.entrada));
    const tocan = validos.filter((d) => d.camino.some(([, p]) => cmp(p, d.niv[L][key]))).length;
    console.log(`  ${L.padEnd(5)} muro ${lado.padEnd(4)}  del lado correcto en ${String(validos.length).padStart(4)} días · lo toca ${((tocan / validos.length) * 100).toFixed(1)}%`);
  }
}

writeFileSync(SALIDA, JSON.stringify({
  generado: new Date().toISOString(),
  fuenteNiveles: NIV, fuenteVehiculo: `${DIR}/SPY_spotmin_y_*.json`,
  minEntrada: MIN_ENTRADA, minCierre: MIN_CIERRE, medioALado: MEDIO_A_LADO,
  aviso: "camino[] = punto MEDIO del NBBO de SPY por minuto. El peaje se aplica aparte: comprar a medio+0,005, vender a medio-0,005.",
  conversion: "nivelSPY = nivelSPX / razonSPX, con razonSPX = SPX(09:35)/SPY(09:35) del propio dia. NO es 10 fijo.",
  descarte, dias,
}), "utf8");
console.log(`\n  escrito ${SALIDA} (${dias.length} días)`);
