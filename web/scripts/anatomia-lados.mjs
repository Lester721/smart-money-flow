// ANATOMÍA 1 · ¿QUÉ LADO PIERDE? — y qué pasa si se quita o se aleja el lado malo.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/anatomia-lados.mjs
//
// ═══ EN QUÉ SE DIFERENCIA DE LO YA MEDIDO ═════════════════════════════════════════════════
//
// Los 17 filtros de régimen y las 30 reglas de gestión se midieron contra la MEDIA: tercio alto
// contra tercio bajo del P&L medio. Todos fallaron. Aquí NO se mide la media: se mide la COLA.
// Un cambio que deje la media igual y parta el peor día por la mitad es un ÉXITO.
//
// La métrica que decide: **$/año que se pierden por cada dólar de caída eliminado**. Cuanto más
// bajo, mejor. Por debajo de ~0,3 el cambio se paga solo; por encima de 1 es un mal negocio.
//
// ═══ CÓMO SE MIDE ═════════════════════════════════════════════════════════════════════════
//
// El cóndor son DOS verticales. Cada día sólo una puede perder (el subyacente no puede cerrar
// arriba y abajo a la vez). Se descompone el P&L de cada día en:
//
//     P&L = crédito − dañoCall − dañoPut − comisiones
//     dañoCall = min(max(cierre − Kcall, 0), ancho)     ← el mercado subió
//     dañoPut  = min(max(Kput − cierre, 0), ancho)      ← el mercado bajó
//
// Precios REALES: bid de lo que se vende, ask de lo que se compra, las cuatro patas. Entrada a
// las 11:00 ET, liquidación contra el precio real de cierre. Comisión $0,03 por pata.
//
// NADA DE FUTURO: los strikes se eligen con el spot de las 11:00, que es lo que se ve al operar.
//
// ⚠️ EL SESGO QUE HAY QUE TENER DELANTE TODO EL RATO: 2024-01 → 2026-08 es un mercado alcista.
// Si el lado call pierde más, la primera explicación no es "el lado call es malo", es "el índice
// subió". Por eso se parte en TRES TERCIOS y se mira si el signo aguanta.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00";
const COMM = 0.03;      // por pata, Robinhood
const ALA = 50;         // ancho de las alas, en puntos

// ─────────────────────────────────────────────────────────────────────────────────────────
// LECTOR — copiado de scripts/desde-2024.mjs sin tocar, para que la línea base reproduzca
// exactamente los $48.638 / 653 días ya publicados.
// ─────────────────────────────────────────────────────────────────────────────────────────
function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) return null;
  const enHora = []; let spotFin = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), hora = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && hora >= hFin) { hFin = hora; spotFin = sp; }
    if (hora !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre: spotFin } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

// ─────────────────────────────────────────────────────────────────────────────────────────
// LAS VARIANTES. `c` = puntos por encima del spot para la call corta (null = SIN lado call).
//                `p` = puntos por debajo para la put corta   (null = SIN lado put).
// ─────────────────────────────────────────────────────────────────────────────────────────
const VARIANTES = [
  { id: "base",        nombre: "CÓNDOR ±25 (la de hoy)",        c: 25,   p: 25 },
  { id: "solo-put",    nombre: "SÓLO put −25 (quitar la call)", c: null, p: 25 },
  { id: "solo-call",   nombre: "SÓLO call +25 (quitar la put)", c: 25,   p: null },
  { id: "c35",         nombre: "call +35 / put −25",            c: 35,   p: 25 },
  { id: "c50",         nombre: "call +50 / put −25",            c: 50,   p: 25 },
  { id: "c75",         nombre: "call +75 / put −25",            c: 75,   p: 25 },
  { id: "p35",         nombre: "call +25 / put −35",            c: 25,   p: 35 },
  { id: "p50",         nombre: "call +25 / put −50",            c: 25,   p: 50 },
  { id: "p75",         nombre: "call +25 / put −75",            c: 25,   p: 75 },
  { id: "ambos35",     nombre: "ambos ±35",                     c: 35,   p: 35 },
  { id: "ambos50",     nombre: "ambos ±50",                     c: 50,   p: 50 },
];
const PRUEBAS = 11;              // las de este script
const PRUEBAS_FAMILIA = 58;      // 17 régimen + 30 gestión + estas 11, sobre los MISMOS 653 días

// ─────────────────────────────────────────────────────────────────────────────────────────
// CONSTRUCCIÓN DÍA A DÍA
// ─────────────────────────────────────────────────────────────────────────────────────────
const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();

/** Devuelve {credito, dano} de una vertical, o null si no se puede construir. */
function verticalCall(filasC, spot, d) {
  const corta = cerca(filasC, spot + d);
  const larga = cerca(filasC, corta.K + ALA);
  if (larga.K <= corta.K) return null;
  return { Kc: corta.K, Kl: larga.K, credito: corta.bid - larga.ask, ancho: larga.K - corta.K };
}
function verticalPut(filasP, spot, d) {
  const corta = cerca(filasP, spot - d);
  const larga = cerca(filasP, corta.K - ALA);
  if (larga.K >= corta.K) return null;
  return { Kc: corta.K, Kl: larga.K, credito: corta.bid - larga.ask, ancho: corta.K - larga.K };
}

const porFecha = new Map();   // fecha -> { [id]: {pl, danoCall, danoPut, credito, ...} }
let sinCadena = 0, sinSpot = 0;

for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) { sinCadena++; continue; }
  const spot = C.filas[0].spot;
  if (!(spot > 0)) { sinSpot++; continue; }
  const S = C.cierre;

  const dia = {};
  let completo = true;
  for (const v of VARIANTES) {
    const vc = v.c == null ? null : verticalCall(C.filas, spot, v.c);
    const vp = v.p == null ? null : verticalPut(P.filas, spot, v.p);
    if ((v.c != null && !vc) || (v.p != null && !vp)) { completo = false; break; }

    const credito = (vc?.credito ?? 0) + (vp?.credito ?? 0);
    if (!(credito > 0)) { completo = false; break; }   // misma criba que la línea base

    const danoCall = vc ? Math.min(Math.max(S - vc.Kc, 0), vc.ancho) : 0;
    const danoPut = vp ? Math.min(Math.max(vp.Kc - S, 0), vp.ancho) : 0;
    // Comisión: la convención de desde-2024.mjs (la que produjo los $48.638 publicados) carga
    // 8 × $0,03 a un cóndor de 4 patas — apertura y cierre de cada pata. Se respeta tal cual para
    // que la línea base reproduzca el número publicado; media vertical paga la mitad.
    const patas = ((vc ? 2 : 0) + (vp ? 2 : 0)) * 2;
    dia[v.id] = {
      pl: (credito - danoCall - danoPut) * 100 - patas * COMM,
      credito: credito * 100,
      danoCall: danoCall * 100,
      danoPut: danoPut * 100,
      // colateral que retiene Robinhood: la vertical más ancha, al ancho completo, menos el crédito
      colateral: (Math.max(vc?.ancho ?? 0, vp?.ancho ?? 0) - credito) * 100,
      Kcall: vc?.Kc ?? null, Kput: vp?.Kc ?? null,
    };
  }
  if (completo) porFecha.set(fecha, { spot, cierre: S, dia });
}

const dias = [...porFecha.keys()].sort();
console.log(`\n═══ ANATOMÍA DE LOS DOS LADOS · SPXW 0DTE · entrada ${HORA} ET · alas ${ALA} pts · 1 contrato ═══`);
console.log(`\nDías con las 11 variantes construibles y crédito > 0: ${dias.length}`);
console.log(`(descartados: ${sinCadena} sin cadena o sin cierre · ${sinSpot} sin spot a las ${HORA} · ${fechas.length - dias.length - sinCadena - sinSpot} porque alguna variante no se podía construir)`);
console.log(`Período: ${dias[0]} → ${dias[dias.length - 1]}`);

// ── RADIOGRAFÍA antes de medir nada ──
const filasBase = dias.map((f) => ({ fecha: f, ...porFecha.get(f).dia.base, cierre: porFecha.get(f).cierre }));
radiografia(filasBase, ["pl", "credito", "danoCall", "danoPut", "cierre", "colateral"], "cóndor base",
  { cerosLegitimos: ["danoCall", "danoPut"] });

// ─────────────────────────────────────────────────────────────────────────────────────────
// UTILIDADES DE COLA
// ─────────────────────────────────────────────────────────────────────────────────────────
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]; };
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
const sd = (v) => { const m = media(v); return Math.sqrt(suma(v.map((x) => (x - m) ** 2)) / (v.length - 1)); };

/** Caída bajo el agua desde cero (la que dio los −$15.176 en desde-2024.mjs). */
function caidaDesdeCero(pls) { let peor = 0, cur = 0; for (const p of pls) { cur = Math.min(0, cur + p); peor = Math.min(peor, cur); } return peor; }
/** Caída de verdad: pico a valle de la curva acumulada. */
function caidaPicoValle(pls) {
  let acum = 0, pico = 0, peor = 0;
  for (const p of pls) { acum += p; pico = Math.max(pico, acum); peor = Math.min(peor, acum - pico); }
  return peor;
}
function resumen(pls) {
  const total = suma(pls);
  return {
    n: pls.length, total, alAno: total / (pls.length / 252), medio: media(pls),
    acierto: pls.filter((x) => x > 0).length / pls.length,
    peorDia: Math.min(...pls), p1: pct(pls, 0.01), p5: pct(pls, 0.05),
    ddCero: caidaDesdeCero(pls), ddPico: caidaPicoValle(pls),
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// PARTE 1 · EL REPARTO DEL DAÑO
// ═════════════════════════════════════════════════════════════════════════════════════════
const B = dias.map((f) => porFecha.get(f).dia.base);
const dC = B.map((x) => x.danoCall), dP = B.map((x) => x.danoPut);
const totC = suma(dC), totP = suma(dP), totD = totC + totP;
const diasC = dC.filter((x) => x > 0).length, diasP = dP.filter((x) => x > 0).length;
const diasLimpios = B.filter((x) => x.danoCall === 0 && x.danoPut === 0).length;

console.log(`\n\n═══ 1 · ¿QUÉ LADO PIERDE? ═══`);
console.log(`\nCrédito cobrado en total: ${eur(suma(B.map((x) => x.credito)))} · daño total pagado: ${eur(-totD)} · comisiones: ${eur(-dias.length * 8 * COMM)}`);
console.log(`P&L neto: ${eur(suma(B.map((x) => x.pl)))}\n`);
console.log("| lado | días que pierde | % de días | daño total | % del daño | daño medio el día que pierde | PEOR día del lado |");
console.log("|---|---|---|---|---|---|---|");
console.log(`| CALL (subió) | ${diasC} | ${((diasC / dias.length) * 100).toFixed(1)}% | ${eur(-totC)} | ${((totC / totD) * 100).toFixed(1)}% | ${eur(-totC / diasC)} | ${eur(-Math.max(...dC))} |`);
console.log(`| PUT (bajó) | ${diasP} | ${((diasP / dias.length) * 100).toFixed(1)}% | ${eur(-totP)} | ${((totP / totD) * 100).toFixed(1)}% | ${eur(-totP / diasP)} | ${eur(-Math.max(...dP))} |`);
console.log(`| ninguno | ${diasLimpios} | ${((diasLimpios / dias.length) * 100).toFixed(1)}% | — | — | — | — |`);

// ¿pesa el peor día de cada lado sobre el total de su lado?
console.log(`\nCuánto pesa el PEOR día de cada lado sobre el daño de ese lado:`);
console.log(`  call: ${eur(-Math.max(...dC))} de ${eur(-totC)} = ${((Math.max(...dC) / totC) * 100).toFixed(1)}%`);
console.log(`  put : ${eur(-Math.max(...dP))} de ${eur(-totP)} = ${((Math.max(...dP) / totP) * 100).toFixed(1)}%`);
const top5C = [...dC].sort((a, b) => b - a).slice(0, 5), top5P = [...dP].sort((a, b) => b - a).slice(0, 5);
console.log(`  los 5 peores días call son el ${((suma(top5C) / totC) * 100).toFixed(1)}% del daño call · los 5 peores put, el ${((suma(top5P) / totP) * 100).toFixed(1)}% del daño put`);

// ── el reparto por AÑO y por TERCIO ──
console.log(`\n── ¿cambia el reparto? ──`);
console.log("| corte | días | daño call | daño put | % call | signo |");
console.log("|---|---|---|---|---|---|");
const cortes = [];
for (const a of ["2024", "2025", "2026"]) {
  const idx = dias.map((f, i) => (f.startsWith(a) ? i : -1)).filter((i) => i >= 0);
  cortes.push({ etiqueta: a, idx });
}
const k = Math.floor(dias.length / 3);
for (let i = 0; i < 3; i++) {
  const idx = i < 2 ? [...Array(k).keys()].map((x) => x + i * k) : [...Array(dias.length - 2 * k).keys()].map((x) => x + 2 * k);
  cortes.push({ etiqueta: `tercio ${i + 1} (${dias[idx[0]]}→${dias[idx[idx.length - 1]]})`, idx });
}
const signosTercio = [];
for (const c of cortes) {
  const cc = suma(c.idx.map((i) => dC[i])), pp = suma(c.idx.map((i) => dP[i]));
  const s = cc > pp ? "call>put" : "put>call";
  if (c.etiqueta.startsWith("tercio")) signosTercio.push(cc > pp ? "+" : "−");
  console.log(`| ${c.etiqueta} | ${c.idx.length} | ${eur(-cc)} | ${eur(-pp)} | ${((cc / (cc + pp)) * 100).toFixed(1)}% | ${s} |`);
}
console.log(`\nSIGNO POR TERCIOS (+ = pierde más el lado call): ${signosTercio.join("")}`);

// t pareada del desequilibrio: d = dañoCall − dañoPut, día a día
const dif = dC.map((x, i) => x - dP[i]);
const tPar = media(dif) / (sd(dif) / Math.sqrt(dif.length));
console.log(`Desequilibrio medio por día: ${eur(media(dif))} (call − put) · t pareada = ${tPar.toFixed(2)}`);
console.log(`Listón de Bonferroni: ${listonT(PRUEBAS)} para las ${PRUEBAS} pruebas de este script · ${listonT(PRUEBAS_FAMILIA)} para las ${PRUEBAS_FAMILIA} de toda la familia sobre estos días`);

// ═════════════════════════════════════════════════════════════════════════════════════════
// PARTE 2 · QUITAR O ALEJAR EL LADO MALO
// ═════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 2 · QUITAR O ALEJAR UN LADO — precios reales, mismos ${dias.length} días ═══\n`);
const R = new Map();
for (const v of VARIANTES) R.set(v.id, resumen(dias.map((f) => porFecha.get(f).dia[v.id].pl)));
const base = R.get("base");

console.log("| variante | $/año | % ingreso retenido | acierto | crédito med. | PEOR día | p1 | p5 | caída (pico-valle) | caída (desde 0) |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const v of VARIANTES) {
  const r = R.get(v.id);
  const cred = media(dias.map((f) => porFecha.get(f).dia[v.id].credito));
  console.log(`| ${v.nombre} | ${eur(r.alAno)} | ${((r.alAno / base.alAno) * 100).toFixed(0)}% | ${(r.acierto * 100).toFixed(0)}% | ${eur(cred)} | ${eur(r.peorDia)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.ddPico)} | ${eur(r.ddCero)} |`);
}

// ── LA MÉTRICA QUE DECIDE ──
console.log(`\n── LA MÉTRICA QUE DECIDE: $/año que se pierden por cada dólar de caída eliminado ──`);
console.log(`   (más bajo = mejor · "—" = no elimina caída, o la empeora)\n`);
console.log("| variante | ingreso perdido $/año | caída eliminada (pico-valle) | $/año por $ de caída | peor día eliminado | $/año por $ de peor día |");
console.log("|---|---|---|---|---|---|");
const eficiencias = [];
for (const v of VARIANTES) {
  if (v.id === "base") continue;
  const r = R.get(v.id);
  const perdido = base.alAno - r.alAno;
  const ddElim = Math.abs(base.ddPico) - Math.abs(r.ddPico);
  const pdElim = Math.abs(base.peorDia) - Math.abs(r.peorDia);
  const ef = ddElim > 0 ? perdido / ddElim : null;
  const efPd = pdElim > 0 ? perdido / pdElim : null;
  eficiencias.push({ v, r, perdido, ddElim, pdElim, ef, efPd });
  console.log(`| ${v.nombre} | ${eur(perdido)} | ${ddElim > 0 ? eur(ddElim) : "—"} | ${ef == null ? "—" : ef.toFixed(2)} | ${pdElim > 0 ? eur(pdElim) : "—"} | ${efPd == null ? "—" : efPd.toFixed(2)} |`);
}

// ── ¿AGUANTA POR AÑO? el candidato tiene que ganar en los tres ──
console.log(`\n── P&L por año de cada variante (¿o vive en un solo año?) ──`);
const años = ["2024", "2025", "2026"];
console.log(`| variante | ${años.join(" | ")} | peor día 2024 | peor día 2025 | peor día 2026 |`);
console.log("|---|---|---|---|---|---|---|");
for (const v of VARIANTES) {
  const porAño = años.map((a) => dias.map((f, i) => (f.startsWith(a) ? porFecha.get(f).dia[v.id].pl : null)).filter((x) => x != null));
  console.log(`| ${v.nombre} | ${porAño.map((g) => eur(suma(g))).join(" | ")} | ${porAño.map((g) => eur(Math.min(...g))).join(" | ")} |`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// PARTE 3 · ¿ES REAL LA MEJORA DE LA COLA, O ES SUERTE DE ESTOS 653 DÍAS?
// Bootstrap por BLOQUES de 10 días (la volatilidad viene en rachas: remuestrear día suelto
// rompería justo el racimo que produce las caídas). El MISMO orden de bloques se aplica a las
// dos series, para que la comparación sea pareada.
// ═════════════════════════════════════════════════════════════════════════════════════════
function bootstrapPareado(plsA, plsB, iter = 4000, bloque = 10) {
  const n = plsA.length, nb = Math.ceil(n / bloque);
  let mejorDD = 0, mejorPeor = 0, mejorTotal = 0;
  const ddA = [], ddB = [];
  for (let it = 0; it < iter; it++) {
    const ia = [], ib = [];
    for (let b = 0; b < nb; b++) {
      const ini = Math.floor(Math.random() * n);
      for (let j = 0; j < bloque && ia.length < n; j++) { const i = (ini + j) % n; ia.push(plsA[i]); ib.push(plsB[i]); }
    }
    const dA = caidaPicoValle(ia), dB = caidaPicoValle(ib);
    ddA.push(dA); ddB.push(dB);
    if (Math.abs(dB) < Math.abs(dA)) mejorDD++;
    if (Math.min(...ib) > Math.min(...ia)) mejorPeor++;
    if (suma(ib) > suma(ia)) mejorTotal++;
  }
  return {
    pMejorDD: mejorDD / iter, pMejorPeor: mejorPeor / iter, pMejorTotal: mejorTotal / iter,
    ddMedioA: media(ddA), ddMedioB: media(ddB), ddP95A: pct(ddA, 0.05), ddP95B: pct(ddB, 0.05),
  };
}

console.log(`\n\n═══ 3 · BOOTSTRAP POR BLOQUES (4.000 remuestreos de bloques de 10 días, pareado) ═══\n`);
console.log("| variante | P(caída menor que la base) | P(peor día menos malo) | P(gana más dinero) | caída media base | caída media variante | caída al 5% peor: base → variante |");
console.log("|---|---|---|---|---|---|---|");
const plsBase = dias.map((f) => porFecha.get(f).dia.base.pl);
const boot = new Map();
for (const v of VARIANTES) {
  if (v.id === "base") continue;
  const b = bootstrapPareado(plsBase, dias.map((f) => porFecha.get(f).dia[v.id].pl));
  boot.set(v.id, b);
  console.log(`| ${v.nombre} | ${(b.pMejorDD * 100).toFixed(0)}% | ${(b.pMejorPeor * 100).toFixed(0)}% | ${(b.pMejorTotal * 100).toFixed(0)}% | ${eur(b.ddMedioA)} | ${eur(b.ddMedioB)} | ${eur(b.ddP95A)} → ${eur(b.ddP95B)} |`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// PARTE 4 · EL COLATERAL — quitar un lado NO libera capital
// ═════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 4 · COLATERAL QUE RETIENE ROBINHOOD (la vertical más ancha, al ancho completo) ═══\n`);
console.log("| variante | colateral mediano | colateral máximo |");
console.log("|---|---|---|");
for (const v of VARIANTES) {
  const col = dias.map((f) => porFecha.get(f).dia[v.id].colateral).sort((a, b) => a - b);
  console.log(`| ${v.nombre} | ${eur(col[col.length >> 1])} | ${eur(col[col.length - 1])} |`);
}

// ── veredicto de la eficiencia ──
const candidatos = eficiencias.filter((e) => e.ef != null && e.ef >= 0).sort((a, b) => a.ef - b.ef);
console.log(`\n\n═══ RESUMEN: variantes ordenadas por $/año perdidos por $ de caída eliminado ═══\n`);
for (const e of candidatos) {
  const b = boot.get(e.v.id);
  console.log(`  ${e.ef.toFixed(2)}  ${e.v.nombre.padEnd(30)} retiene ${((e.r.alAno / base.alAno) * 100).toFixed(0)}% del ingreso · caída ${eur(base.ddPico)} → ${eur(e.r.ddPico)} · peor día ${eur(base.peorDia)} → ${eur(e.r.peorDia)} · P(caída menor)=${(b.pMejorDD * 100).toFixed(0)}%`);
}
if (!candidatos.length) console.log("  NINGUNA variante elimina caída. Todas la dejan igual o peor.");

writeFileSync("scripts/anatomia-lados-salida.json", JSON.stringify({
  dias: dias.length, periodo: [dias[0], dias[dias.length - 1]],
  reparto: { danoCall: totC, danoPut: totP, diasCall: diasC, diasPut: diasP, diasLimpios, tPareada: tPar, signosTercio: signosTercio.join("") },
  variantes: Object.fromEntries(VARIANTES.map((v) => [v.id, { nombre: v.nombre, ...R.get(v.id), boot: boot.get(v.id) ?? null }])),
}, null, 2));
console.log(`\n(detalle en scripts/anatomia-lados-salida.json)`);
