// ¿LO QUE PASA ANTES DE LAS 11:00 ANTICIPA LA COLA? — 16 señales intradía contra el DÍA MALO.
//
// ═══ EN QUÉ SE DIFERENCIA DE LO YA MEDIDO ════════════════════════════════════════════════════
// Los 17 filtros de régimen y las 30 reglas de gestión se midieron contra la MEDIA (tercio alto
// contra tercio bajo del P&L medio). Aquí NO se mide la media. Se define un DÍA MALO y se mide
// si la señal lo anticipa:  P(pérdida > $2.000) · P(pérdida > $4.000) · percentil 5 · percentil 1.
// Y si la señal filtrara: cuánto baja el PEOR DÍA, cuánto baja la PEOR RACHA, cuánto ingreso cuesta.
//
// ═══ LA LISTA SE CIERRA AQUÍ, ANTES DE MEDIR ═════════════════════════════════════════════════
// 16 señales. El divisor de Bonferroni es 16 y no se baja. Se reporta además el listón de 63
// (17 de régimen + 30 de gestión + estas 16) porque el dato es el mismo y ya se ha buscado en él.
//
// ═══ REGLA DE ORO ════════════════════════════════════════════════════════════════════════════
// TODO se observa a las 11:00 ET o antes. Nada de lo que decide la entrada usa el cierre de hoy.
// El camino de la mañana sale de scripts/colaintra-camino.json (09:35→11:00, 18 marcas de 5 minutos,
// extraído de los propios ficheros de cadena). OJO: la marca de 09:30 trae underlying_price = 0
// en el feed, así que "apertura" = 09:35. Se dice, no se rellena.

import { readFileSync, writeFileSync } from "node:fs";
import { listonT, tWelch } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const PRUEBAS = 16;
const LISTON = listonT(PRUEBAS);
const LISTON_TODO = listonT(63);
const MALO = 2000, MUYMALO = 4000;      // definición de DÍA MALO, en dólares de pérdida

const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const camino = JSON.parse(readFileSync("scripts/colaintra-camino.json", "utf8"));

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.max(0, Math.min(s.length - 1, Math.floor(s.length * q)))]; };
const ANUAL = 252;

// racha peor = drawdown máximo real: dd_t = min(0, dd_{t-1} + pl_t)
function racha(pls) { let cur = 0, peor = 0; for (const p of pls) { cur = Math.min(0, cur + p); peor = Math.min(peor, cur); } return peor; }

// ── FASE A · las 16 señales, todas de la mañana ──────────────────────────────────────────────
const SQRT5MIN = Math.sqrt(5 / (252 * 6.5));      // el mismo factor con que se construyó sigma
const BARRAS_ANO = 252 * 78;                       // barras de 5 minutos en un año

let sinCamino = 0;
for (let i = 0; i < filas.length; i++) {
  const f = filas[i], ant = filas[i - 1];
  const c = camino[f.fecha];
  if (!c) { sinCamino++; continue; }
  const marcas = Object.keys(c).sort();
  const s = marcas.map((h) => c[h]);
  const sig = f.sigma;                              // movimiento esperado del RESTO de sesión

  let largo = 0, paso5Max = 0, sumaR2 = 0, enDireccion = 0;
  const dNeto = f.sp11 - f.ap;
  const difs = [];
  for (let k = 1; k < s.length; k++) {
    const d = s[k] - s[k - 1];
    difs.push(d);
    largo += Math.abs(d);
    if (Math.abs(d) > paso5Max) paso5Max = Math.abs(d);
    const r = Math.log(s[k] / s[k - 1]);
    sumaR2 += r * r;
    if (dNeto !== 0 && Math.sign(d) === Math.sign(dNeto)) enDireccion++;
  }
  const rvAnual = Math.sqrt(sumaR2 / difs.length) * Math.sqrt(BARRAS_ANO);
  const ivAtm = sig > 0 ? sig / (f.sp11 * SQRT5MIN) : null;

  // primera hora (09:35→10:35) contra última media hora (10:35→11:00), normalizado por nº de barras
  const iCorte = marcas.indexOf("10:35");
  let largo1 = 0, largo2 = 0;
  if (iCorte > 0) {
    for (let k = 1; k <= iCorte; k++) largo1 += Math.abs(s[k] - s[k - 1]);
    for (let k = iCorte + 1; k < s.length; k++) largo2 += Math.abs(s[k] - s[k - 1]);
  }
  const nb1 = iCorte, nb2 = s.length - 1 - iCorte;

  // nuevos extremos de la mañana a partir de las 10:05
  let mx = s[0], mn = s[0], nuevos = 0;
  const i2 = marcas.indexOf("10:05");
  for (let k = 1; k < s.length; k++) {
    const nuevoMx = s[k] > mx, nuevoMn = s[k] < mn;
    if (nuevoMx) mx = s[k];
    if (nuevoMn) mn = s[k];
    if (k >= i2 && (nuevoMx || nuevoMn)) nuevos++;
  }

  const s1030 = c["10:30"];
  const rango = f.maxM - f.minM;

  // ── A · cuánto se ha movido ya
  f.movAbs      = Math.abs(f.sp11 / f.ap - 1) * 100;
  f.movSigma    = sig > 0 ? Math.abs(dNeto) / sig : null;
  f.movFirmado  = (f.sp11 / f.ap - 1) * 100;
  f.huecoAbs    = ant ? Math.abs(f.ap / ant.cierre - 1) * 100 : null;
  f.huecoFirm   = ant ? (f.ap / ant.cierre - 1) * 100 : null;
  // ── B · el rango de la mañana
  f.rangoSigma  = sig > 0 ? rango / sig : null;
  f.extremo     = rango > 0 ? Math.abs((f.sp11 - f.minM) / rango - 0.5) * 2 : null;
  f.posRango    = rango > 0 ? (f.sp11 - f.minM) / rango : null;
  // ── C · velocidad
  f.caminoSigma = sig > 0 ? largo / sig : null;
  f.paso5Sigma  = sig > 0 ? paso5Max / sig : null;
  f.rvIv        = ivAtm > 0 ? rvAnual / ivAtm : null;
  f.aceleracion = (largo1 > 0 && nb1 > 0 && nb2 > 0) ? (largo2 / nb2) / (largo1 / nb1) : null;
  // ── D · tendencia o rango
  f.eficiencia  = largo > 0 ? Math.abs(dNeto) / largo : null;
  f.monotonia   = difs.length ? enDireccion / difs.length : null;
  f.nuevosExtr  = nuevos;
  f.derivaUlt   = (sig > 0 && s1030 > 0) ? Math.abs(f.sp11 - s1030) / sig : null;
}
if (sinCamino) console.log("⚠️  " + sinCamino + " días sin camino de 5 minutos — quedan fuera, no se rellenan");

// EL GUARDIÁN — un campo muerto se lee como cero y se mide durante horas sin enterarse.
radiografia(filas, ["pl", "movAbs", "movSigma", "huecoAbs", "rangoSigma", "extremo", "posRango",
                    "caminoSigma", "paso5Sigma", "rvIv", "aceleracion", "eficiencia", "monotonia",
                    "nuevosExtr", "derivaUlt"], "días del cóndor + señales de la mañana",
           { maxCeros: 0.25 });

// ── FASE B · la lista cerrada ────────────────────────────────────────────────────────────────
const SENALES = [
  ["A", "movAbs",      "% que se ha movido de la apertura a las 11:00"],
  ["A", "movSigma",    "ese movimiento medido en sigma del resto de sesión"],
  ["A", "movFirmado",  "el mismo movimiento CON SIGNO (negativo = cayendo)"],
  ["A", "huecoAbs",    "% de hueco de apertura contra el cierre de ayer"],
  ["A", "huecoFirm",   "el hueco CON SIGNO"],
  ["B", "rangoSigma",  "rango de la mañana en sigma"],
  ["B", "extremo",     "qué tan al borde del rango de la mañana llega a las 11:00"],
  ["B", "posRango",    "posición dentro del rango (0 = en el mínimo, 1 = en el máximo)"],
  ["C", "caminoSigma", "longitud del camino recorrido (suma de |Δ| de 5 min) en sigma"],
  ["C", "paso5Sigma",  "el mayor salto de 5 minutos, en sigma"],
  ["C", "rvIv",        "vol realizada de la mañana ÷ IV del dinero a las 11:00"],
  ["C", "aceleracion", "velocidad de la última media hora ÷ la de la primera hora"],
  ["D", "eficiencia",  "|neto| ÷ camino recorrido: 1 = tendencia pura, 0 = puro rango"],
  ["D", "monotonia",   "fracción de barras de 5 min en la dirección del neto"],
  ["D", "nuevosExtr",  "nº de nuevos máximos/mínimos de la mañana después de las 10:05"],
  ["D", "derivaUlt",   "|movimiento de la última media hora| en sigma"],
];
if (SENALES.length !== PRUEBAS) throw new Error("declaradas " + PRUEBAS + " pruebas y hay " + SENALES.length + " señales");

function zProp(k1, n1, k2, n2) {
  if (!n1 || !n2) return 0;
  const p1 = k1 / n1, p2 = k2 / n2, p = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? (p1 - p2) / se : 0;
}
function tercios(val, campo) {
  const ord = [...val].sort((a, b) => b[campo] - a[campo]);
  const k = Math.floor(ord.length / 3);
  return { alto: ord.slice(0, k), bajo: ord.slice(-k) };
}
function retrato(g) {
  const pls = g.map((f) => f.pl);
  return {
    n: g.length, media: media(pls),
    p2k: pls.filter((x) => x < -MALO).length / pls.length,
    p4k: pls.filter((x) => x < -MUYMALO).length / pls.length,
    k2k: pls.filter((x) => x < -MALO).length, k4k: pls.filter((x) => x < -MUYMALO).length,
    p05: pct(pls, 0.05), p01: pct(pls, 0.01), peor: Math.min(...pls),
  };
}

console.log("\n" + "═".repeat(110));
console.log("  PREDECIR LA COLA · INTRADÍA · " + PRUEBAS + " señales declaradas · listón |z| = " + LISTON);
console.log("  (listón conservador contando las 47 pruebas anteriores del proyecto: " + LISTON_TODO + ")");
console.log("  DÍA MALO = pérdida > " + eur(MALO) + " · DÍA MUY MALO = pérdida > " + eur(MUYMALO));
console.log("═".repeat(110));

const base = filas.map((f) => f.pl);
const baseR = retrato(filas);
const totalBase = base.reduce((a, b) => a + b, 0);
const anosBase = filas.length / ANUAL;
const ingresoBase = totalBase / anosBase;
const peorBase = Math.min(...base), rachaBase = racha(base);

console.log("\n## LA LÍNEA BASE · " + filas.length + " días, todos operados");
console.log("   media " + eur(baseR.media) + "/día · " + eur(ingresoBase) + "/año · total " + eur(totalBase));
console.log("   P(pérdida>" + eur(MALO) + ") = " + (baseR.p2k * 100).toFixed(1) + "% (" + baseR.k2k + " días) · P(pérdida>" + eur(MUYMALO) + ") = " + (baseR.p4k * 100).toFixed(1) + "% (" + baseR.k4k + " días)");
console.log("   percentil 5 = " + eur(baseR.p05) + " · percentil 1 = " + eur(baseR.p01) + " · PEOR DÍA = " + eur(baseR.peor) + " · PEOR RACHA = " + eur(rachaBase));

// ── FASE C · la criba, señal por señal ───────────────────────────────────────────────────────
console.log("\n## LAS 16 SEÑALES · tercio ALTO contra tercio BAJO, medido en la COLA\n");
console.log("| g | señal | n | P(>2k) alto | P(>2k) bajo | z | P(>4k) A/B | p5 alto | p5 bajo | p1 alto | p1 bajo | media A−B | signo 3 tercios |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");

const res = [];
for (const [g, campo, desc] of SENALES) {
  const val = filas.filter((f) => f[campo] != null && isFinite(f[campo]));
  if (val.length < 200) { console.log("| " + g + " | `" + campo + "` | " + val.length + " | — | — | — | — | — | — | — | — | — | **sin muestra** |"); continue; }
  const { alto, bajo } = tercios(val, campo);
  const A = retrato(alto), B = retrato(bajo);
  const z = zProp(A.k2k, A.n, B.k2k, B.n);

  const porFecha = [...val].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const kt = Math.floor(porFecha.length / 3);
  const signos = [], detT = [];
  for (let i = 0; i < 3; i++) {
    const bloque = i < 2 ? porFecha.slice(i * kt, (i + 1) * kt) : porFecha.slice(2 * kt);
    const t3 = tercios(bloque, campo);
    const rA = retrato(t3.alto), rB = retrato(t3.bajo);
    const d = rA.p2k - rB.p2k;
    signos.push(d > 0 ? "+" : d < 0 ? "−" : "0");
    detT.push({ periodo: bloque[0].fecha + "→" + bloque[bloque.length - 1].fecha, dP2k: d, dP05: rA.p05 - rB.p05, nAlto: rA.n, p2kAlto: rA.p2k, p2kBajo: rB.p2k });
  }
  res.push({ g, campo, desc, n: val.length, A, B, z, signos: signos.join(""), detT });
  console.log("| " + g + " | `" + campo + "` | " + val.length + " | " + (A.p2k*100).toFixed(1) + "% | " + (B.p2k*100).toFixed(1) + "% | **" + z.toFixed(2) + "** | " + (A.p4k*100).toFixed(1) + "%/" + (B.p4k*100).toFixed(1) + "% | " + eur(A.p05) + " | " + eur(B.p05) + " | " + eur(A.p01) + " | " + eur(B.p01) + " | " + eur(A.media - B.media) + " | " + signos.join("") + " |");
}

// ── FASE C2 · ¿y la MEDIA? — para saber si el filtro cuesta ingreso o es gratis ───────────────
console.log("\n## LA MEDIA, POR SEPARADO · un filtro sirve si la cola cae y la media NO\n");
console.log("| señal | media alto | media bajo | dif | t de la media | signo de la dif en los 3 tercios |");
console.log("|---|---|---|---|---|---|");
for (const r of res) {
  const val = filas.filter((f) => f[r.campo] != null && isFinite(f[r.campo]));
  const { alto, bajo } = tercios(val, r.campo);
  const t = tWelch(alto.map((f) => f.pl), bajo.map((f) => f.pl));
  const porFecha = [...val].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const kt = Math.floor(porFecha.length / 3);
  const sg = [];
  for (let i = 0; i < 3; i++) {
    const bloque = i < 2 ? porFecha.slice(i * kt, (i + 1) * kt) : porFecha.slice(2 * kt);
    const t3 = tercios(bloque, r.campo);
    const d = media(t3.alto.map((f) => f.pl)) - media(t3.bajo.map((f) => f.pl));
    sg.push(d > 0 ? "+" : "−");
  }
  r.tMedia = t; r.signosMedia = sg.join("");
  console.log("| `" + r.campo + "` | " + eur(r.A.media) + " | " + eur(r.B.media) + " | " + eur(r.A.media - r.B.media) + " | " + t.toFixed(2) + " | " + sg.join("") + " |");
}

// ── FASE D · si filtrara ─────────────────────────────────────────────────────────────────────
// OJO CON LA ANUALIZACIÓN: saltarse días NO comprime el calendario. El ingreso/año se divide
// SIEMPRE por los 2,59 años del período, nunca por los días operados. (Bug propio, cazado y
// corregido: dividir por los días operados hacía parecer que tirar el 33% subía el ingreso.)
const TIRAR = [0.10, 0.20, 0.333];
const ANOS = filas.length / ANUAL;

function simular(fuera) {
  const dentro = filas.filter((f) => !fuera.has(f.fecha));
  const pls = dentro.map((f) => f.pl);
  const suma = pls.reduce((a, b) => a + b, 0);
  const rch = racha(pls);
  return {
    dias: dentro.length, suma, ing: suma / ANOS, conserva: suma / totalBase,
    peor: Math.min(...pls), rch,
    dCaida: rch - rachaBase, dPeorDia: Math.min(...pls) - peorBase,
    perdido: (totalBase - suma) / ANOS,
    p2k: pls.filter((x) => x < -MALO).length / pls.length,
    p05: pct(pls, 0.05), p01: pct(pls, 0.01),
    porCaida: Math.abs(rch) > 0 ? (suma / ANOS) / Math.abs(rch) : null,
  };
}

const filtros = [];
for (const [g, campo, desc] of SENALES) {
  const val = filas.filter((f) => f[campo] != null && isFinite(f[campo]));
  if (val.length < 200) continue;
  for (const lado of ["alto", "bajo"]) {
    for (const q of TIRAR) {
      const ord = [...val].sort((a, b) => a[campo] - b[campo]);
      const k = Math.round(ord.length * q);
      const fuera = new Set((lado === "alto" ? ord.slice(-k) : ord.slice(0, k)).map((f) => f.fecha));
      filtros.push({ campo, lado, q, k, desc, fuera, ...simular(fuera) });
    }
  }
}

const porCaidaBase = ingresoBase / Math.abs(rachaBase);
console.log("\n## SI FILTRARA · " + filtros.length + " combinaciones (16 señales × 2 lados × 3 umbrales fijados de antemano)\n");
console.log("   LA MÉTRICA QUE DECIDE: $/año por cada $ de caída. La línea base son " + porCaidaBase.toFixed(3) +
            " ($" + Math.round(ingresoBase).toLocaleString("es-ES") + " de ingreso por cada $" + Math.abs(Math.round(rachaBase)).toLocaleString("es-ES") + " de caída).\n");
console.log("| señal | lado | tira | ingreso/año | % conservado | peor día | peor racha | Δcaída | P(>2k) | p5 | $/año por $ de caída |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const ranking = [...filtros].sort((a, b) => b.porCaida - a.porCaida);
for (const x of ranking.slice(0, 15)) {
  console.log("| `" + x.campo + "` | " + x.lado + " | " + (x.q*100).toFixed(0) + "% | " + eur(x.ing) + " | " + (x.conserva*100).toFixed(0) + "% | " +
              eur(x.peor) + " | " + eur(x.rch) + " | " + eur(x.dCaida) + " | " + (x.p2k*100).toFixed(1) + "% | " + eur(x.p05) + " | **" + x.porCaida.toFixed(3) + "** |");
}
console.log("\n   sin filtro | — | 0% | " + eur(ingresoBase) + " | 100% | " + eur(peorBase) + " | " + eur(rachaBase) + " | — | " +
            (baseR.p2k*100).toFixed(1) + "% | " + eur(baseR.p05) + " | " + porCaidaBase.toFixed(3));
console.log("   " + filtros.filter((x) => x.dCaida <= 0).length + " de " + filtros.length + " combinaciones NO reducen la racha");
console.log("   " + filtros.filter((x) => x.porCaida > porCaidaBase).length + " de " + filtros.length + " mejoran la métrica de $/año por $ de caída");

// ── FASE E · los candidatos, AÑO POR AÑO ─────────────────────────────────────────────────────
// Un filtro que sólo funciona en un año no sirve para operar. Se mira 2024, 2025 y 2026 aparte.
const CAND = ranking.slice(0, 6);
console.log("\n## LOS 6 MEJORES, AÑO POR AÑO · un filtro que sólo vale en un año no se opera\n");
for (const x of CAND) {
  console.log("### `" + x.campo + "` " + x.lado + ", tirando el " + (x.q*100).toFixed(0) + "% — " + x.desc);
  console.log("| año | días | tirados | P&L sin filtro | P&L con filtro | conserva | peor racha sin | peor racha con | ¿mejora la caída? |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  let ok = 0;
  for (const a of ["2024", "2025", "2026"]) {
    const todos = filas.filter((f) => f.fecha.startsWith(a));
    const dentro = todos.filter((f) => !x.fuera.has(f.fecha));
    const s0 = todos.reduce((t, f) => t + f.pl, 0), s1 = dentro.reduce((t, f) => t + f.pl, 0);
    const r0 = racha(todos.map((f) => f.pl)), r1 = racha(dentro.map((f) => f.pl));
    const mejora = r1 > r0;
    if (mejora) ok++;
    console.log("| " + a + " | " + todos.length + " | " + (todos.length - dentro.length) + " | " + eur(s0) + " | " + eur(s1) + " | " +
                (s0 !== 0 ? ((s1 / s0) * 100).toFixed(0) + "%" : "—") + " | " + eur(r0) + " | " + eur(r1) + " | " + (mejora ? "sí" : "**no**") + " |");
  }
  console.log("   → mejora la caída en " + ok + " de 3 años\n");
}

writeFileSync("scripts/colaintra-resultado.json", JSON.stringify({
  base: baseR, ingresoBase, peorBase, rachaBase, porCaidaBase, senales: res,
  filtros: filtros.map(({ fuera, ...r }) => ({ ...r, tirados: [...fuera] })),
}, null, 2), "utf8");
console.log("\n   detalle en scripts/colaintra-resultado.json");
