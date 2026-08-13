// ¿VENDER CALLS DE HOOD CUANDO EL SEGURO ESTÁ CARO? — el único ángulo que no exige adivinar.
//
// Vender una call por delta es apostar "no va a subir tanto": exige predecir la dirección, y
// llevamos meses midiendo que la dirección no se predice. Nueve configuraciones mecánicas
// perdieron dinero contra no hacer nada.
//
// Esto es otra apuesta: **vender sólo cuando la volatilidad implícita está cara respecto a su
// propia historia**. No requiere saber hacia dónde va la acción — sólo comparar el precio del
// seguro consigo mismo. Es la prima de riesgo de varianza, lo único de este campo con respaldo
// académico de que persiste.
//
// Se prueba sobre la celda **14 días, delta 0,15**, que salió en −0,153% con t=−0,67:
// prácticamente cero. Si un filtro puede rescatar algo, tiene que ser donde apenas se pierde.
// Las otras ocho pierden demasiado (hasta −2,15% por ciclo) para que ningún filtro las salve.
//
// ╔═══ SIN MIRAR EL FUTURO ═══╗
// El percentil de la IV se calcula SÓLO con las observaciones ANTERIORES a esa fecha. Usar toda
// la muestra para decidir el percentil de un día pasado sería mirar adelante — y es un error
// fácil de cometer sin darse cuenta.
//
// Uso: node scripts/calls-hood-por-volatilidad.mjs [DTE] [DELTA]

import fs from "node:fs";
import path from "node:path";

const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "").replace(/\/v3$/, "") + "/v3";
// Parametrizado para poder CONFIRMAR el hallazgo en otros activos: un efecto que sólo vive en
// un ticker y un plazo es el perfil exacto del sobreajuste.
const TICKER = (process.argv[2] || "HOOD").toUpperCase();
const DTE = Number(process.argv[3] || 14);
const DELTA_OBJ = Number(process.argv[4] || 0.15);
const TASAS = 0.03;
const DIR = `scripts/cache-theta/calls-${TICKER.toLowerCase()}`;

const nd = (x) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p; };
const deltaCall = (S, K, T, v) => nd((Math.log(S / K) + (v * v / 2) * T) / (v * Math.sqrt(T)));

async function texto(ruta, intentos = 3) {
  for (let i = 1; i <= intentos; i++) {
    try { const r = await fetch(`${B}/${ruta}`, { signal: AbortSignal.timeout(120000) }); if (r.ok) return await r.text(); }
    catch { /* reintenta */ }
    if (i < intentos) await new Promise((s) => setTimeout(s, 2000 * i));
  }
  return null;
}

const cierres = new Map();
for (const [a, b] of [["2022-01-01", "2022-12-31"], ["2023-01-01", "2023-12-31"], ["2024-01-01", "2024-12-31"],
                      ["2025-01-01", "2025-12-31"], ["2026-01-01", "2026-08-12"]]) {
  const t = await texto(`stock/history/eod?symbol=${TICKER}&start_date=${a}&end_date=${b}`);
  if (!t) continue;
  const lin = t.trim().split("\n"), cab = lin[0].split(",");
  const iC = cab.indexOf("close"), iT = cab.indexOf("last_trade");
  for (const l of lin.slice(1)) {
    const c = l.split(","), f = (c[iT] ?? "").slice(0, 10), p = +c[iC];
    if (/^\d{4}-\d{2}-\d{2}$/.test(f) && p > 0) cierres.set(f, p);
  }
}

// Los ciclos, con la IV real del strike vendido. Todo de la caché ya bajada.
const ciclos = [];
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".json")).sort()) {
  const [exp, entrada] = f.replace(".json", "").split("_");
  const Sini = cierres.get(entrada), Sfin = cierres.get(exp);
  if (!(Sini > 0) || !(Sfin > 0)) continue;
  // Sólo los ficheros del plazo pedido.
  const dias = (Date.parse(exp) - Date.parse(entrada)) / 86400000;
  if (Math.abs(dias - DTE) > 1) continue;
  let filas; try { filas = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { continue; }
  if (filas.length < 5) continue;
  const hs = [...new Set(filas.map((r) => r[0]))].sort();
  const enHora = filas.filter((r) => r[0] === hs[hs.length - 1]);
  const U = enHora[0]?.[5];
  if (!(U > 0)) continue;
  const T = DTE / 365;
  let mejor = null, dif = 9;
  for (const [, K, bid, ask, iv] of enHora) {
    const d = deltaCall(U, K, T, iv);
    if (Math.abs(d - DELTA_OBJ) < dif) { dif = Math.abs(d - DELTA_OBJ); mejor = { K, bid, ask, iv }; }
  }
  if (!mejor || dif > 0.10) continue;
  const prima = mejor.bid - TASAS;
  if (!(prima > 0)) continue;
  ciclos.push({ entrada, exp, Sini, Sfin, K: mejor.K, iv: mejor.iv,
                aporta: (prima - Math.max(0, Sfin - mejor.K)) / Sini * 100 });
}
ciclos.sort((a, b) => (a.entrada < b.entrada ? -1 : 1));

const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const de = (a) => { const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const tUno = (a) => media(a) / (de(a) / Math.sqrt(a.length));

console.log(`═══ CALLS DE ${TICKER} FILTRADAS POR VOLATILIDAD CARA ═══`);
console.log(`   ${DTE} días · delta ${DELTA_OBJ} · ${ciclos.length} ciclos\n`);
if (ciclos.length < 60) { console.log("   muestra insuficiente"); process.exit(0); }

// Percentil de la IV usando SÓLO el pasado. Los primeros 40 ciclos se descartan: no hay historia
// con la que compararlos, y rellenarlos con la muestra entera sería mirar adelante.
const conPct = [];
for (let i = 40; i < ciclos.length; i++) {
  const previas = ciclos.slice(0, i).map((c) => c.iv);
  const pct = previas.filter((v) => v < ciclos[i].iv).length / previas.length * 100;
  conPct.push({ ...ciclos[i], pct });
}
console.log(`   ciclos con historia suficiente para el percentil: ${conPct.length}\n`);

console.log(`   TODOS                          n=${String(conPct.length).padStart(3)}   aporta ${(media(conPct.map((c) => c.aporta)) >= 0 ? "+" : "") + media(conPct.map((c) => c.aporta)).toFixed(3)}%   t=${tUno(conPct.map((c) => c.aporta)).toFixed(2)}`);
console.log("");
for (const [etiq, filtro] of [
  ["IV en el 20% MÁS CARO de su historia", (c) => c.pct >= 80],
  ["IV en el 33% más caro", (c) => c.pct >= 67],
  ["IV en la mitad cara", (c) => c.pct >= 50],
  ["IV en la mitad barata", (c) => c.pct < 50],
  ["IV en el 20% más barato", (c) => c.pct < 20],
]) {
  const g = conPct.filter(filtro);
  if (g.length < 25) { console.log(`   ${etiq.padEnd(38)} n=${String(g.length).padStart(3)}   (muestra corta)`); continue; }
  const a = g.map((c) => c.aporta);
  const anios = (Date.parse(g[g.length - 1].exp) - Date.parse(g[0].exp)) / 31557600000;
  console.log(`   ${etiq.padEnd(38)} n=${String(g.length).padStart(3)}   aporta ${(media(a) >= 0 ? "+" : "") + media(a).toFixed(3)}%   t=${tUno(a).toFixed(2)}   ${(media(a) * (g.length / anios) >= 0 ? "+" : "") + (media(a) * (g.length / anios)).toFixed(1)}%/año`);
}

// Y la comprobación que decide: si sale algo, ¿aguanta en las dos mitades del tiempo?
const caras = conPct.filter((c) => c.pct >= 50);
if (caras.length >= 30) {
  const c = Math.floor(caras.length / 2);
  const m1 = media(caras.slice(0, c).map((x) => x.aporta)), m2 = media(caras.slice(c).map((x) => x.aporta));
  console.log(`\n   La MITAD CARA, partida en el tiempo:`);
  console.log(`      1ª mitad ${(m1 >= 0 ? "+" : "") + m1.toFixed(3)}%   2ª mitad ${(m2 >= 0 ? "+" : "") + m2.toFixed(3)}%   ${Math.sign(m1) === Math.sign(m2) ? "coherentes" : "SE CONTRADICEN"}`);
}
console.log(`\n   Recordatorio: "aporta" es sobre TENER LAS ACCIONES. Positivo = la call añadió.\n`);
