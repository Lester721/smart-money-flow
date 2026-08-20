// LA CAJA · refutación del hallazgo "amplitud como riesgo" contra la cuenta REAL.
//
// El hallazgo mide P&L flotante. La caja de Lester no funciona así:
//   · $7.977 EN EFECTIVO. Las pérdidas salen de ahí, no del poder de compra.
//   · $5.000 de colateral por cóndor (una vertical al ancho completo, alas de 50).
//   · Interés de margen del 5% anual sobre cualquier saldo de efectivo NEGATIVO.
//   · 500 acciones de HOOD ($48.135) — el 85% de la cuenta — que se mueven CON el mercado.
//
// Lo que este script comprueba, y que el hallazgo no comprueba:
//   A · el libro de caja cronológico con interés real → $/año NETO
//   B · el arranque rodante: el hallazgo dice "suelo $7.977" porque empezó en 2022 (+$8.902 en
//       39 sesiones) ANTES del mal tramo. Aquí se arranca la caja en las 1.069 fechas posibles.
//   C · la correlación con HOOD: los días de cola del cóndor son días de caída del mercado, y
//       el 85% de la cuenta es una acción de beta alta. Nadie ha mirado eso.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/caja-amplitud.mjs

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

// ═══ LA CAJA REAL ═══════════════════════════════════════════════════════════════════════════
const CUENTA = 56389;
const EFECTIVO0 = 7977;         // <- el cuello de botella
const PODER = 73874;
const COLATERAL = 5000;         // por cóndor, alas de 50
const INTERES = 0.05;           // anual, sobre saldo de efectivo negativo
const HOOD_ACCIONES = 500;

const PRUEBAS = 24, LISTON = listonT(PRUEBAS);
const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct = (x) => (x == null || !Number.isFinite(x) ? "—" : (x * 100).toFixed(1) + "%");
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const ANCHO = 106;
const raya = (t) => { console.log("\n" + "═".repeat(ANCHO)); console.log("  " + t); console.log("═".repeat(ANCHO)); };

const { dias } = JSON.parse(readFileSync("scripts/amplitud-riesgo-dias.json", "utf8"));

// ═══ MEDIAS — idénticas al script original, cierres estrictamente anteriores ════════════════
const MC = [5, 20, 50];
const MA = {};
for (const k of MC) MA[k] = dias.map((_, i) => { if (i < k) return null; let s = 0; for (let j = i - k; j < i; j++) s += dias[j].cierre; return s / k; });

const BASE = { a: null, b: null, dist: 25, n: "±25 todos los días (base)" };
const REF = { a: 20, b: 50, dist: 30, n: "±30 · MA20+MA50 (el filtro de la nota)" };
const GANA = { a: 5, b: 50, dist: 45, n: "±45 · MA5+MA50 (el que el hallazgo elige)" };
const GANA2 = { a: 5, b: 20, dist: 45, n: "±45 · MA5+MA20 (el que elige la otra mitad)" };

// serie de P&L por sesión (0 = no se opera ese día)
function serie(c, k = 1) {
  return dias.map((d, i) => {
    const p = d.pnl[String(c.dist)];
    if (p == null) return 0;
    if (c.a == null) return p * k;
    const m1 = MA[c.a][i], m2 = c.b ? MA[c.b][i] : m1;
    if (m1 == null || m2 == null) return 0;
    return d.sp11 >= m1 && d.sp11 >= m2 ? p * k : 0;
  });
}
const opera = (c, i) => {
  const d = dias[i];
  if (d.pnl[String(c.dist)] == null) return false;
  if (c.a == null) return true;
  const m1 = MA[c.a][i], m2 = c.b ? MA[c.b][i] : m1;
  return m1 != null && m2 != null && d.sp11 >= m1 && d.sp11 >= m2;
};

// ═══ RADIOGRAFÍA — antes de medir nada ══════════════════════════════════════════════════════
console.log(`\n# LA CAJA · ¿queda algo del hallazgo cuando el dinero es de verdad?\n`);
console.log(`${dias.length} sesiones · ${dias[0].fecha} → ${dias[dias.length - 1].fecha}`);
console.log(`Efectivo ${eur(EFECTIVO0)} · colateral ${eur(COLATERAL)}/cóndor · interés ${pct(INTERES)} · poder ${eur(PODER)}`);
console.log(`${PRUEBAS} pruebas declaradas · listón |t| = ${LISTON}\n`);

const filas = dias.map((d, i) => ({
  fecha: d.fecha, ticker: "SPXW",
  pnl45: d.pnl["45"], cred45: d.cred["45"], sp11: d.sp11, cierre: d.cierre,
  ma5: MA[5][i], ma50: MA[50][i],
}));
radiografia(filas.filter((f) => f.pnl45 != null && f.ma50 != null),
  ["pnl45", "cred45", "sp11", "cierre", "ma5", "ma50"], "caja-amplitud", { cerosLegitimos: ["pnl45"] });

// ═══ A · EL LIBRO DE CAJA ═══════════════════════════════════════════════════════════════════
// Interés diario sobre saldo NEGATIVO, por días de calendario entre sesiones.
// El colateral del 0DTE se toma y se suelta el mismo día → no genera préstamo de un día para
// otro; lo que sí genera préstamo es una PÉRDIDA que deja el efectivo bajo cero.
function libro(pl, desde = 0, hasta = dias.length, cash0 = EFECTIVO0) {
  let cash = cash0, minCash = cash0, minFecha = dias[desde].fecha;
  let interes = 0, primerRojo = null, primerBajoColateral = null, diasEnRojo = 0;
  let bloqueados = 0, plBruto = 0, plNeto = 0;
  for (let i = desde; i < hasta; i++) {
    if (i > desde) {   // interés por los días de calendario transcurridos
      const dt = (new Date(dias[i].fecha) - new Date(dias[i - 1].fecha)) / 86400000;
      if (cash < 0) { const c = -cash * INTERES * dt / 365; cash -= c; interes += c; }
    }
    // ¿puede abrir? el requisito sale del poder de compra; si no llega, el día NO se opera
    const req = Math.abs(pl[i]) > 0 || pl[i] === 0 ? null : null;
    if (pl[i] !== 0) {
      const kReq = COLATERAL * (pl.kContratos ?? 1);
      if (kReq > PODER + Math.min(0, cash)) { bloqueados++; continue; }
      cash += pl[i]; plBruto += pl[i]; plNeto += pl[i];
    }
    if (cash < 0 && primerRojo == null) primerRojo = dias[i].fecha;
    if (cash < 0) diasEnRojo++;
    if (cash < COLATERAL && primerBajoColateral == null) primerBajoColateral = dias[i].fecha;
    if (cash < minCash) { minCash = cash; minFecha = dias[i].fecha; }
  }
  const anos = (hasta - desde) / 252;
  return { cashFin: cash, minCash, minFecha, interes, primerRojo, primerBajoColateral, diasEnRojo,
           bloqueados, brutoAno: plBruto / anos, netoAno: (plBruto - interes) / anos, anos };
}

raya("A · EL LIBRO DE CAJA — cronológico, con interés de verdad, desde $7.977");
console.log(`
  El hallazgo reporta "suelo de efectivo $7.977" para su configuración: nunca baja del arranque.
  Aquí se comprueba eso mismo cobrando el interés y mirando en qué fecha el efectivo se queda por
  debajo del colateral de UN cóndor (${eur(COLATERAL)}), que es el momento en que la caja deja de poder
  financiarse sola y pasa a tirar de margen.
`);
console.log("| configuración | k | días op. | $/año BRUTO | interés total | **$/año NETO** | suelo efectivo | fecha del suelo | 1ª vez < $5.000 | 1ª vez en ROJO |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const guarda = {};
for (const c of [BASE, REF, GANA, GANA2]) {
  for (const k of [1, 2]) {
    const s = serie(c, k); s.kContratos = k;
    const r = libro(s);
    guarda[c.n + "|" + k] = r;
    console.log(`| ${c.n} | ${k} | ${s.filter((x) => x !== 0).length} | ${eur(r.brutoAno)} | ${eur(r.interes)} | **${eur(r.netoAno)}** | ${eur(r.minCash)} | ${r.minFecha} | ${r.primerBajoColateral ?? "nunca"} | ${r.primerRojo ?? "nunca"} |`);
  }
}

// ═══ B · EL ARRANQUE RODANTE ════════════════════════════════════════════════════════════════
raya("B · EL ARRANQUE RODANTE — ¿o es que el orden de los días le salvó?");
console.log(`
  La caja no arranca en un pico: arranca HOY, con ${eur(EFECTIVO0)}. El hallazgo empieza a contar en
  2022-04, un tramo que dio +$8.902 en 39 sesiones, y con ese colchón por delante ningún bajón
  posterior toca el suelo. Eso no es una propiedad de la regla, es una propiedad de la FECHA.
  Aquí se arranca la misma caja, con la misma regla y sin tocar nada, en cada una de las fechas
  posibles, y se le dan 252 sesiones (un año) de recorrido.
`);
function rodante(c, k, ventana = 252) {
  const s = serie(c, k); s.kContratos = k;
  const out = [];
  for (let i = 0; i + ventana <= dias.length; i++) {
    const r = libro(s, i, i + ventana);
    out.push({ inicio: dias[i].fecha, min: r.minCash, rojo: r.primerRojo, bajo: r.primerBajoColateral, neto: r.netoAno });
  }
  return out;
}
console.log("| configuración | k | ventanas de 1 año | % que se quedan bajo $5.000 | % que entran en ROJO | peor suelo | fecha de arranque del peor | $/año NETO mediano | peor año |");
console.log("|---|---|---|---|---|---|---|---|---|");
const rod = {};
for (const c of [BASE, REF, GANA, GANA2]) {
  for (const k of [1, 2]) {
    const v = rodante(c, k);
    rod[c.n + "|" + k] = v;
    const peor = v.reduce((a, b) => (b.min < a.min ? b : a));
    const netos = v.map((x) => x.neto).sort((a, b) => a - b);
    console.log(`| ${c.n} | ${k} | ${v.length} | ${pct(v.filter((x) => x.bajo).length / v.length)} | ${pct(v.filter((x) => x.rojo).length / v.length)} | ${eur(peor.min)} | ${peor.inicio} | ${eur(netos[Math.floor(netos.length / 2)])} | ${eur(netos[0])} |`);
  }
}

// ═══ C · HOOD — el 85% de la cuenta se mueve con el mercado ═════════════════════════════════
raya("C · LOS DÍAS DE COLA DEL CÓNDOR SON LOS DÍAS EN QUE HOOD CAE");
const hb = JSON.parse(readFileSync("scripts/cache-theta/HOOD_bars_20201122_20270308.json", "utf8"));
const hMap = new Map(hb.map((r) => [r.time, r.close]));
const hFechas = hb.map((r) => r.time);
const hIdx = new Map(hFechas.map((f, i) => [f, i]));
function retHOOD(fecha) {
  const i = hIdx.get(fecha);
  if (i == null || i === 0) return null;
  const a = hb[i - 1].close, b = hb[i].close;
  return a > 0 ? b / a - 1 : null;
}
const sG = serie(GANA, 1);
const conHood = dias.map((d, i) => ({ fecha: d.fecha, pl: sG[i], op: sG[i] !== 0, rH: retHOOD(d.fecha) }))
  .filter((x) => x.op && x.rH != null);
console.log(`\n  ${conHood.length} de ${sG.filter((x) => x !== 0).length} días operados tienen cierre de HOOD (el fichero llega a ${hb[hb.length - 1].time}).`);
const ord = [...conHood].sort((a, b) => a.pl - b.pl);
const n20 = Math.max(1, Math.round(conHood.length * 0.05));
const cola = ord.slice(0, n20), resto = ord.slice(n20);
const valorHOOD = (r) => HOOD_ACCIONES * 96.27 * r;   // 500 acc. al precio de hoy ($48.135)
console.log(`\n| grupo | n | P&L medio del cóndor | retorno medio de HOOD | HOOD en $ (500 acc.) | GOLPE TOTAL medio |`);
console.log("|---|---|---|---|---|---|");
for (const [n, g] of [["5% peor del cóndor", cola], ["el resto de días operados", resto]]) {
  const mp = media(g.map((x) => x.pl)), mr = media(g.map((x) => x.rH));
  console.log(`| ${n} | ${g.length} | ${eur(mp)} | ${(mr * 100).toFixed(2)}% | ${eur(valorHOOD(mr))} | **${eur(mp + valorHOOD(mr))}** |`);
}
const peor10 = ord.slice(0, 10);
console.log(`\n  Los 10 peores días del cóndor, con lo que hacía HOOD el MISMO día:`);
console.log("\n| fecha | cóndor | HOOD % | HOOD $ | total del día |");
console.log("|---|---|---|---|---|");
for (const x of peor10) console.log(`| ${x.fecha} | ${eur(x.pl)} | ${(x.rH * 100).toFixed(2)}% | ${eur(valorHOOD(x.rH))} | **${eur(x.pl + valorHOOD(x.rH))}** |`);

// t de la diferencia de retorno de HOOD entre cola y resto
function tWelch(a, b) {
  const ma = media(a), mb = media(b);
  const va = a.reduce((s, x) => s + (x - ma) ** 2, 0) / (a.length - 1);
  const vb = b.reduce((s, x) => s + (x - mb) ** 2, 0) / (b.length - 1);
  return (ma - mb) / Math.sqrt(va / a.length + vb / b.length);
}
const tH = tWelch(cola.map((x) => x.rH), resto.map((x) => x.rH));
console.log(`\n  HOOD en la cola del cóndor vs el resto: t = ${tH.toFixed(2)} (listón ${LISTON}) → ${Math.abs(tH) > LISTON ? "la correlación de cola es REAL" : "no pasa el listón"}`);

// ═══ D · LA CAJA CONJUNTA — cóndor + HOOD, y el margen de verdad ════════════════════════════
raya("D · LA CAJA CONJUNTA — el efectivo cuando HOOD también se mueve");
console.log(`
  El colateral no sale del aire: sale del poder de compra, y el poder de compra lo sostiene HOOD.
  Aquí el poder de compra se mueve con HOOD (la parte no-efectivo de los ${eur(PODER)} escala con su
  precio) y el efectivo paga las pérdidas. Es la caja entera, no la pata del cóndor sola.
`);
const PODER_NO_CASH = PODER - EFECTIVO0;
function libroConjunto(c, k) {
  const s = serie(c, k);
  let cash = EFECTIVO0, minCash = EFECTIVO0, minFecha = dias[0].fecha, interes = 0;
  let bloqueados = 0, bruto = 0, primerRojo = null, hRef = null;
  for (let i = 0; i < dias.length; i++) {
    if (i > 0) {
      const dt = (new Date(dias[i].fecha) - new Date(dias[i - 1].fecha)) / 86400000;
      if (cash < 0) { const cst = -cash * INTERES * dt / 365; cash -= cst; interes += cst; }
    }
    const h = hMap.get(dias[i].fecha);
    if (h != null && hRef == null) hRef = h;
    const escala = h != null && hRef ? h / hRef : 1;
    const poderHoy = PODER_NO_CASH * escala + Math.max(0, cash);
    if (s[i] !== 0) {
      if (COLATERAL * k > poderHoy) { bloqueados++; continue; }
      cash += s[i]; bruto += s[i];
    }
    if (cash < 0 && primerRojo == null) primerRojo = dias[i].fecha;
    if (cash < minCash) { minCash = cash; minFecha = dias[i].fecha; }
  }
  const anos = dias.length / 252;
  return { minCash, minFecha, interes, bloqueados, primerRojo, bruto, netoAno: (bruto - interes) / anos };
}
console.log("| configuración | k | días bloqueados por poder de compra | suelo efectivo | fecha | interés | **$/año NETO** |");
console.log("|---|---|---|---|---|---|---|");
for (const c of [BASE, REF, GANA, GANA2]) for (const k of [1, 2]) {
  const r = libroConjunto(c, k);
  console.log(`| ${c.n} | ${k} | ${r.bloqueados} | ${eur(r.minCash)} | ${r.minFecha} | ${eur(r.interes)} | **${eur(r.netoAno)}** |`);
}

// ═══ E · LAS TASAS DE ÍNDICE ════════════════════════════════════════════════════════════════
raya("E · SENSIBILIDAD A LAS TASAS — el script cobra $0,03 por pata; SPXW no es una acción");
console.log(`
  El constructor cobra 8 patas × $0,03 = $0,24 por cóndor. Las opciones de ÍNDICE llevan además
  la tasa de licencia de Cboe (del orden de $0,45–0,65 por contrato para SPX/SPXW). No la he
  podido confirmar en la web de Robinhood desde aquí, así que va como SENSIBILIDAD, no como dato.
`);
const sG1 = serie(GANA, 1);
const nOp = sG1.filter((x) => x !== 0).length;
const anosT = dias.length / 252;
console.log("| tasa por contrato | coste extra por cóndor | coste total | **$/año NETO de ±45·MA5+MA50, k=1** |");
console.log("|---|---|---|---|");
const baseNeto = guarda[GANA.n + "|1"].netoAno;
for (const tasa of [0.03, 0.25, 0.5, 0.65]) {
  const extra = (tasa - 0.03) * 8;
  console.log(`| $${tasa.toFixed(2)} | ${eur(extra)} | ${eur(extra * nOp)} | **${eur(baseNeto - extra * nOp / anosT)}** |`);
}

// ═══ F · EL AÑO MALO, EN LA CAJA ════════════════════════════════════════════════════════════
raya("F · 2023 EN LA CAJA — el año que hay que poder aguantar");
console.log(`
  Si Lester enciende esto y le toca un 2023, la caja tiene que sobrevivir a un año que dio $238.
  Se arranca la caja el 1 de enero de cada año con ${eur(EFECTIVO0)} limpios y se mira dónde acaba.
`);
console.log("| año | días op. | $ del año (k=1) | suelo efectivo k=1 | $ del año (k=2) | suelo efectivo k=2 | ¿ROJO con k=2? |");
console.log("|---|---|---|---|---|---|---|");
const anos = [...new Set(dias.map((d) => d.ano))].sort();
for (const a of anos) {
  const i0 = dias.findIndex((d) => d.ano === a);
  const i1 = dias.map((d) => d.ano).lastIndexOf(a) + 1;
  const s1 = serie(GANA, 1); s1.kContratos = 1;
  const s2 = serie(GANA, 2); s2.kContratos = 2;
  const r1 = libro(s1, i0, i1), r2 = libro(s2, i0, i1);
  const nop = s1.slice(i0, i1).filter((x) => x !== 0).length;
  console.log(`| **${a}** | ${nop} | ${eur(r1.cashFin - EFECTIVO0)} | ${eur(r1.minCash)} | ${eur(r2.cashFin - EFECTIVO0)} | ${eur(r2.minCash)} | ${r2.primerRojo ? "**SÍ · " + r2.primerRojo + "**" : "no"} |`);
}

// ═══ G · EL PEOR CAMINO POSIBLE — la racha ══════════════════════════════════════════════════
raya("G · LA RACHA — cuántos días malos seguidos aguanta la caja");
const perd = sG1.map((x, i) => ({ i, pl: x, fecha: dias[i].fecha })).filter((x) => x.pl < 0).sort((a, b) => a.pl - b.pl);
console.log(`\n  Días perdedores del filtro ±45·MA5+MA50: ${perd.length} de ${nOp} operados (${pct(perd.length / nOp)}).`);
console.log(`  Los 6 peores: ${perd.slice(0, 6).map((x) => `${x.fecha} ${eur(x.pl)}`).join(" · ")}`);
// peor suma de 2, 3 y 5 días operados consecutivos
const opsSeq = sG1.map((x, i) => ({ x, f: dias[i].fecha })).filter((o) => o.x !== 0);
for (const w of [2, 3, 5, 10]) {
  let peor = Infinity, pf = "";
  for (let i = 0; i + w <= opsSeq.length; i++) {
    const s = suma(opsSeq.slice(i, i + w).map((o) => o.x));
    if (s < peor) { peor = s; pf = `${opsSeq[i].f}→${opsSeq[i + w - 1].f}`; }
  }
  console.log(`  peor racha de ${String(w).padStart(2)} operaciones seguidas: ${eur(peor)} (${pf}) · k=1 deja el efectivo en ${eur(EFECTIVO0 + peor)} · k=2 en ${eur(EFECTIVO0 + 2 * peor)}`);
}

raya("RESUMEN DE CAJA");
const g1 = guarda[GANA.n + "|1"], g2 = guarda[GANA.n + "|2"];
console.log(`
  ±45 · MA5+MA50, k=1 : $/año BRUTO ${eur(g1.brutoAno)} · interés ${eur(g1.interes)} · **NETO ${eur(g1.netoAno)}**
                        suelo ${eur(g1.minCash)} (${g1.minFecha}) · rojo: ${g1.primerRojo ?? "nunca"}
  ±45 · MA5+MA50, k=2 : $/año BRUTO ${eur(g2.brutoAno)} · interés ${eur(g2.interes)} · **NETO ${eur(g2.netoAno)}**
                        suelo ${eur(g2.minCash)} (${g2.minFecha}) · rojo: ${g2.primerRojo ?? "nunca"}
`);
