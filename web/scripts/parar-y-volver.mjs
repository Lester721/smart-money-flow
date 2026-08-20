// PARAR Y VOLVER — ¿sirve dejar de operar un tiempo para cortar la COLA del cóndor 0DTE?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/parar-y-volver.mjs
//
// ═══ EN QUÉ SE DIFERENCIA DE LO YA MEDIDO ════════════════════════════════════════════════════
// Los 17 filtros de régimen y las 30 reglas de gestión anteriores eran reglas DE DÍA: miran el
// día de hoy y deciden si se entra. Y se juzgaron contra la MEDIA (tercio alto contra bajo).
// Aquí se mide otra cosa: reglas de ESTADO — se apaga la máquina durante un tiempo y se vuelve a
// encender — y se juzgan contra la COLA: peor día, percentil 1 y 5, y peor racha acumulada.
//
// ═══ LA REGLA DE ORO ═════════════════════════════════════════════════════════════════════════
// Todo lo que decide la entrada de HOY se conoce ANTES de las 11:00 de hoy:
//   · el P&L de una operación se conoce a las 16:00 → sólo puede parar días POSTERIORES
//   · el VIX entra SIEMPRE con el cierre de AYER (la suscripción Index no da intradía)
// El 2024-01-02 no tiene cierre de VIX anterior en el fichero: ese día las reglas de VIX OPERAN.
// Se declara aquí; es 1 día de 653 y no cambia ningún signo.
//
// ═══ EL CONTROL QUE DECIDE ═══════════════════════════════════════════════════════════════════
// Una peor racha es UN número de UN camino. Quitar días —los que sean— cambia la curva entera y
// puede mejorar la racha por pura suerte. Por eso cada regla se compara contra PARAR EL MISMO
// NÚMERO DE DÍAS ELEGIDOS AL AZAR (500 sorteos, como se pidió; 20.000 para las que salen al
// borde, porque con 500 el p no baja de 1/501 y el listón de Bonferroni está por debajo).
// Y un SEGUNDO control, más duro: parar los mismos EPISODIOS (mismo número y mismas duraciones)
// colocados al azar. Ese separa "parar en el momento bueno" de "parar a rachas".
//
// ═══ LAS 40 PRUEBAS, DECLARADAS ANTES DE CORRER ══════════════════════════════════════════════
//   A (20)  parar N días tras una pérdida mayor de $X    N∈{1,2,3,5,10} × X∈{500,1000,2000,3000}
//   B  (6)  no operar mientras el VIX de AYER pase de U   U∈{15,17,20,22,25,30}
//   C  (4)  parar el resto del mes tras perder más de $X en el mes   X∈{1000,2000,3000,5000}
//   D  (6)  parar M días tras N cierres perdedores seguidos   N∈{2,3,4} × M∈{1,3}
//   E  (4)  cuatro combinaciones FIJAS de las anteriores (unión: para si dispara cualquiera)
// El divisor del listón es 40 y NO SE BAJA. Los umbrales son redondos y se fijaron antes de ver
// un solo resultado: si luego se afinan, el listón deja de valer.

import { writeFileSync } from "node:fs";
import { listonT, tWelch } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";
import { cargar, drawdown, media, pct, eur } from "./anatomia3-lib.mjs";

const PRUEBAS = 40;
const LISTON = listonT(PRUEBAS);
const SORTEOS = 500;          // lo pedido
const SORTEOS_FINO = 20000;   // sólo para las que rocen el borde con 500
const TAMANO = 1;             // todo por CONTRATO. A tamaño 2 se multiplica por 2, es lineal.

const { filas } = cargar();
const N = filas.length;
const ANOS = N / 252;         // 2,591 años de calendario. El denominador NO cambia al parar días.

// ── EL GUARDIÁN ────────────────────────────────────────────────────────────────────────────
// Un campo muerto se lee como cero y se mide durante horas sin enterarse.
radiografia(filas, ["pl", "credito", "cierre", "ap", "sp11", "sigma", "vix"], "días del cóndor", { maxCeros: 0.2 });

const PL = filas.map((f) => f.pl * TAMANO);
const sinVix = filas.filter((f) => f.vix == null).length;
console.log(`## ${N} días · ${filas[0].fecha} → ${filas[N - 1].fecha} · ${ANOS.toFixed(3)} años · tamaño ${TAMANO} contrato`);
console.log(`## días sin cierre de VIX anterior (las reglas de VIX operan ese día): ${sinVix}`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  MÉTRICAS — la serie de la CUENTA: los días parados valen 0, no desaparecen.
// ═══════════════════════════════════════════════════════════════════════════════════════════
function metricas(opera) {
  const serie = PL.map((p, i) => (opera[i] ? p : 0));
  const operados = PL.filter((_, i) => opera[i]);
  const total = serie.reduce((a, b) => a + b, 0);
  const peores = [...operados].sort((a, b) => a - b);
  return {
    nOpera: operados.length,
    nPara: N - operados.length,
    total,
    alAno: total / ANOS,
    mediaOp: operados.length ? total / operados.length : 0,
    acierto: operados.length ? operados.filter((x) => x > 0).length / operados.length : 0,
    peor: operados.length ? peores[0] : 0,
    // percentiles sobre la serie ENTERA de la cuenta (parado = $0). Es lo que vive el bolsillo.
    p1: pct(serie, 0.01),
    p5: pct(serie, 0.05),
    // cola sin depender del camino: media del 5% peor y suma de los 20 peores días operados
    cvar5: operados.length ? media(peores.slice(0, Math.max(1, Math.floor(operados.length * 0.05)))) : 0,
    suma20: peores.slice(0, 20).reduce((a, b) => a + b, 0),
    dd: drawdown(serie),
  };
}

const BASE = metricas(new Array(N).fill(true));

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  LAS REGLAS. Cada una devuelve un array de booleanos: true = se opera ese día.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// A · parar N días tras una pérdida mayor de $X. La pérdida se conoce a las 16:00 → para MAÑANA.
function reglaA(dias, umbral) {
  const op = new Array(N).fill(true);
  let bloqueo = 0;
  for (let i = 0; i < N; i++) {
    if (bloqueo > 0) { op[i] = false; bloqueo--; continue; }
    if (PL[i] < -umbral) bloqueo = dias;          // sólo cuentan las pérdidas REALIZADAS
  }
  return op;
}

// B · no operar mientras el VIX de AYER pase de U. Vuelve solo cuando baja.
function reglaB(u) {
  return filas.map((f) => !(f.vix != null && f.vix > u));
}

// C · parar el RESTO DEL MES tras acumular en el mes una pérdida mayor de $X.
function reglaC(umbral) {
  const op = new Array(N).fill(true);
  let mes = null, acum = 0, parado = false;
  for (let i = 0; i < N; i++) {
    const m = filas[i].fecha.slice(0, 7);
    if (m !== mes) { mes = m; acum = 0; parado = false; }
    if (parado) { op[i] = false; continue; }
    acum += PL[i];
    if (acum < -umbral) parado = true;            // se para a partir de MAÑANA
  }
  return op;
}

// D · parar M días tras N cierres perdedores seguidos.
function reglaD(racha, espera) {
  const op = new Array(N).fill(true);
  let seguidas = 0, bloqueo = 0;
  for (let i = 0; i < N; i++) {
    if (bloqueo > 0) { op[i] = false; bloqueo--; continue; }
    if (PL[i] < 0) seguidas++; else seguidas = 0;
    if (seguidas >= racha) { bloqueo = espera; seguidas = 0; }
  }
  return op;
}

const union = (...rs) => { const o = new Array(N).fill(true); for (const r of rs) for (let i = 0; i < N; i++) if (!r[i]) o[i] = false; return o; };

const REGLAS = [];
for (const d of [1, 2, 3, 5, 10]) for (const x of [500, 1000, 2000, 3000])
  REGLAS.push({ fam: "A", nom: `A·${d}d tras −$${x}`, desc: `parar ${d} día(s) tras perder más de $${x}`, op: reglaA(d, x) });
for (const u of [15, 17, 20, 22, 25, 30])
  REGLAS.push({ fam: "B", nom: `B·VIX>${u}`, desc: `no operar mientras el VIX de ayer pase de ${u}`, op: reglaB(u) });
for (const x of [1000, 2000, 3000, 5000])
  REGLAS.push({ fam: "C", nom: `C·mes −$${x}`, desc: `parar el resto del mes tras perder $${x} en el mes`, op: reglaC(x) });
for (const n of [2, 3, 4]) for (const m of [1, 3])
  REGLAS.push({ fam: "D", nom: `D·${n} malos→${m}d`, desc: `parar ${m} día(s) tras ${n} cierres perdedores seguidos`, op: reglaD(n, m) });
REGLAS.push({ fam: "E", nom: "E1·A(3d,2k)+VIX20", desc: "A(3 días tras −$2.000) unida a VIX de ayer > 20", op: union(reglaA(3, 2000), reglaB(20)) });
REGLAS.push({ fam: "E", nom: "E2·A(3d,2k)+mes3k", desc: "A(3 días tras −$2.000) unida a parar el mes tras −$3.000", op: union(reglaA(3, 2000), reglaC(3000)) });
REGLAS.push({ fam: "E", nom: "E3·VIX20+D(3→3)", desc: "VIX de ayer > 20 unida a parar 3 días tras 3 perdedores", op: union(reglaB(20), reglaD(3, 3)) });
REGLAS.push({ fam: "E", nom: "E4·A(5d,3k)+VIX25+mes3k", desc: "A(5 días tras −$3.000) + VIX>25 + parar el mes tras −$3.000", op: union(reglaA(5, 3000), reglaB(25), reglaC(3000)) });

if (REGLAS.length !== 36) console.log(`## ATENCIÓN: se declararon 40 pruebas y se corren ${REGLAS.length}. El divisor sigue siendo 40.`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  LOS CONTROLES
// ═══════════════════════════════════════════════════════════════════════════════════════════
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Parar K días SUELTOS elegidos al azar. */
function sorteoDias(k, rnd) {
  const op = new Array(N).fill(true);
  let puestos = 0;
  while (puestos < k) { const i = Math.floor(rnd() * N); if (op[i]) { op[i] = false; puestos++; } }
  return op;
}

/** Los EPISODIOS de parada de una regla: longitudes de cada tramo seguido sin operar. */
function episodios(op) {
  const ls = []; let c = 0;
  for (let i = 0; i < N; i++) { if (!op[i]) c++; else if (c) { ls.push(c); c = 0; } }
  if (c) ls.push(c);
  return ls;
}

/** Parar los MISMOS episodios (mismo número y duración) colocados al azar, sin solaparse. */
function sorteoBloques(largos, rnd) {
  const libres = N - largos.reduce((a, b) => a + b, 0);
  if (libres < 0) return new Array(N).fill(false);
  // barajar la mezcla de "bloque" y "día suelto libre" da una colocación uniforme sin solapes
  const fichas = [...largos.map((l) => -l), ...new Array(libres).fill(1)];
  for (let i = fichas.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [fichas[i], fichas[j]] = [fichas[j], fichas[i]]; }
  const op = []; for (const f of fichas) { if (f > 0) op.push(true); else for (let z = 0; z < -f; z++) op.push(false); }
  return op;
}

// dirección de "mejor" para cada métrica: en todas, MÁS ALTO es mejor (menos negativo)
const METRICAS = ["alAno", "peor", "p1", "p5", "cvar5", "suma20", "dd"];

function control(regla, sorteos, generador) {
  const rnd = mulberry32(20260819);
  const gana = Object.fromEntries(METRICAS.map((m) => [m, 0]));
  let ganaCoste = 0;
  const m = metricas(regla.op);
  const costeR = coste(m);
  const acum = Object.fromEntries(METRICAS.map((k) => [k, []]));
  for (let s = 0; s < sorteos; s++) {
    const mm = metricas(generador(rnd));
    for (const k of METRICAS) { if (mm[k] >= m[k]) gana[k]++; acum[k].push(mm[k]); }
    const c = coste(mm);
    if (c != null && costeR != null && c <= costeR) ganaCoste++;   // el azar compra la racha igual de barata
  }
  const p = Object.fromEntries(METRICAS.map((k) => [k, (gana[k] + 1) / (sorteos + 1)]));
  p.coste = costeR == null ? null : (ganaCoste + 1) / (sorteos + 1);
  const mediana = Object.fromEntries(METRICAS.map((k) => [k, pct(acum[k], 0.5)]));
  return { p, mediana, sorteos };
}

/** COSTE = $/año que se dejan de ganar por cada $ de peor racha eliminado. Más bajo, mejor. */
function coste(m) {
  const ddElim = Math.abs(BASE.dd) - Math.abs(m.dd);
  if (ddElim <= 0) return null;                    // no quitó racha: no hay precio que valga
  return (BASE.alAno - m.alAno) / ddElim;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  MEDIR
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(120)}`);
console.log(`  LA BASE · ${BASE.nOpera} días operados · ${eur(BASE.total)} · ${eur(BASE.alAno)}/año · acierto ${(BASE.acierto * 100).toFixed(1)}%`);
console.log(`  peor día ${eur(BASE.peor)} · p1 ${eur(BASE.p1)} · p5 ${eur(BASE.p5)} · CVaR5 ${eur(BASE.cvar5)} · 20 peores ${eur(BASE.suma20)} · PEOR RACHA ${eur(BASE.dd)}`);
console.log(`  listón de |t| = ${LISTON} (Bonferroni sobre ${PRUEBAS} pruebas declaradas)`);
console.log(`${"═".repeat(120)}`);

const salida = [];
console.log(`\n## LAS ${REGLAS.length} REGLAS · lo que hacen\n`);
console.log("| regla | días parados | episodios | $/año | retenido | peor día | p1 | p5 | CVaR5 | peor racha | racha quitada | COSTE $/$ |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of REGLAS) {
  const m = metricas(r.op);
  const eps = episodios(r.op);
  const ddElim = Math.abs(BASE.dd) - Math.abs(m.dd);
  const c = coste(m);
  r.m = m; r.eps = eps; r.ddElim = ddElim; r.coste = c;
  console.log(`| ${r.nom} | ${m.nPara} (${((m.nPara / N) * 100).toFixed(0)}%) | ${eps.length} | ${eur(m.alAno)} | ${((m.alAno / BASE.alAno) * 100).toFixed(0)}% | ${eur(m.peor)} | ${eur(m.p1)} | ${eur(m.p5)} | ${eur(m.cvar5)} | ${eur(m.dd)} | ${eur(ddElim)} | ${c == null ? "no quita" : c.toFixed(2)} |`);
}

// ── LOS CONTROLES ────────────────────────────────────────────────────────────────────────────
console.log(`\n## EL CONTROL · ¿le gana al azar? · ${SORTEOS} sorteos parando los mismos días\n`);
console.log("  p = fracción de sorteos al azar que iguala o mejora a la regla. Bajo = la regla hace algo.");
console.log(`  Con ${SORTEOS} sorteos el p no puede bajar de ${(1 / (SORTEOS + 1)).toFixed(4)}; las que llegan ahí se repiten con ${SORTEOS_FINO}.\n`);
console.log("| regla | p(peor día) | p(p5) | p(CVaR5) | p(peor racha) | p($/año) | p(COSTE) | mediana azar $/año | mediana azar racha |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const r of REGLAS) {
  const k = r.m.nPara;
  if (k === 0) { console.log(`| ${r.nom} | — no para ningún día — |`); r.ctrl = null; continue; }
  r.ctrl = control(r, SORTEOS, (rnd) => sorteoDias(k, rnd));
  const p = r.ctrl.p;
  console.log(`| ${r.nom} | ${p.peor.toFixed(4)} | ${p.p5.toFixed(4)} | ${p.cvar5.toFixed(4)} | **${p.dd.toFixed(4)}** | ${p.alAno.toFixed(4)} | ${p.coste == null ? "—" : p.coste.toFixed(4)} | ${eur(r.ctrl.mediana.alAno)} | ${eur(r.ctrl.mediana.dd)} |`);
}

console.log(`\n## EL CONTROL DURO · mismos EPISODIOS (nº y duración) colocados al azar · ${SORTEOS} sorteos\n`);
console.log("| regla | episodios | p(peor día) | p(CVaR5) | p(peor racha) | p($/año) | p(COSTE) |");
console.log("|---|---|---|---|---|---|---|");
for (const r of REGLAS) {
  if (!r.ctrl) continue;
  r.ctrlB = control(r, SORTEOS, (rnd) => sorteoBloques(r.eps, rnd));
  const p = r.ctrlB.p;
  console.log(`| ${r.nom} | ${r.eps.length}× (mediana ${pct(r.eps, 0.5)}d) | ${p.peor.toFixed(4)} | ${p.cvar5.toFixed(4)} | **${p.dd.toFixed(4)}** | ${p.alAno.toFixed(4)} | ${p.coste == null ? "—" : p.coste.toFixed(4)} |`);
}

// ── AFINAR LAS QUE ROZAN EL BORDE ────────────────────────────────────────────────────────────
const bordes = REGLAS.filter((r) => r.ctrl && Math.min(r.ctrl.p.dd, r.ctrl.p.coste ?? 1, r.ctrl.p.peor, r.ctrl.p.cvar5) <= 0.02);
if (bordes.length) {
  console.log(`\n## AFINADO · ${bordes.length} regla(s) rozaron el borde con ${SORTEOS} sorteos → se repiten con ${SORTEOS_FINO}\n`);
  console.log(`  El listón de Bonferroni para ${PRUEBAS} pruebas es p < ${(0.05 / PRUEBAS).toFixed(5)}.\n`);
  console.log("| regla | p(peor día) | p(CVaR5) | p(peor racha) | p(COSTE) | ¿bajo el listón? |");
  console.log("|---|---|---|---|---|---|");
  for (const r of bordes) {
    r.fino = control(r, SORTEOS_FINO, (rnd) => sorteoDias(r.m.nPara, rnd));
    const p = r.fino.p, mejor = Math.min(p.dd, p.coste ?? 1, p.peor, p.cvar5);
    console.log(`| ${r.nom} | ${p.peor.toFixed(5)} | ${p.cvar5.toFixed(5)} | ${p.dd.toFixed(5)} | ${p.coste == null ? "—" : p.coste.toFixed(5)} | ${mejor < 0.05 / PRUEBAS ? "🟢 SÍ" : "no"} |`);
  }
}

// ── ¿ES ESTABLE EN EL TIEMPO? los tres tercios ───────────────────────────────────────────────
console.log("\n## LOS TRES TERCIOS · ¿la regla quita dinero o lo salva, en cada período?\n");
console.log("  Se mira el P&L MEDIO de los días que la regla manda PARAR contra los que deja operar.");
console.log("  Si los días parados ganaban dinero, la regla se paga con ingreso. Signo por tercios.\n");
console.log("| regla | media días PARADOS | media días operados | diferencia | t | signo por tercios |");
console.log("|---|---|---|---|---|---|");
const k3 = Math.floor(N / 3);
for (const r of REGLAS) {
  const fuera = PL.filter((_, i) => !r.op[i]), dentro = PL.filter((_, i) => r.op[i]);
  if (fuera.length < 5) { console.log(`| ${r.nom} | — (${fuera.length} días) | | | | |`); r.signos = "—"; r.t = 0; continue; }
  const t = tWelch(fuera, dentro);
  const signos = [0, 1, 2].map((g) => {
    const ini = g * k3, fin = g === 2 ? N : (g + 1) * k3;
    const f = [], d = [];
    for (let i = ini; i < fin; i++) (r.op[i] ? d : f).push(PL[i]);
    if (f.length < 3 || d.length < 3) return "·";
    return media(f) - media(d) >= 0 ? "+" : "−";
  }).join("");
  r.signos = signos; r.t = t;
  console.log(`| ${r.nom} | ${eur(media(fuera))} | ${eur(media(dentro))} | ${eur(media(fuera) - media(dentro))} | ${t.toFixed(2)} | ${signos} |`);
}

// ── VEREDICTO ────────────────────────────────────────────────────────────────────────────────
// Para que una regla "sirva" tiene que: (1) quitar racha de verdad, (2) conservar el grueso del
// ingreso, y (3) GANARLE AL AZAR en los dos controles. Los tres, no dos de tres.
const criterio = (r) => {
  if (!r.ctrl) return { sirve: false, por: "no para ningún día" };
  const fallos = [];
  if (r.ddElim < 3000) fallos.push(`sólo quita ${eur(r.ddElim)} de racha (menos de $3.000)`);
  if (r.m.alAno < BASE.alAno * 0.7) fallos.push(`retiene sólo el ${((r.m.alAno / BASE.alAno) * 100).toFixed(0)}% del ingreso`);
  const pDD = (r.fino ?? r.ctrl).p.dd, pC = (r.fino ?? r.ctrl).p.coste;
  if (pDD > 0.05 / PRUEBAS) fallos.push(`el azar iguala su racha el ${(pDD * 100).toFixed(1)}% de las veces`);
  if (r.ctrlB.p.dd > 0.05) fallos.push(`los mismos episodios al azar la igualan el ${(r.ctrlB.p.dd * 100).toFixed(1)}% de las veces`);
  if (pC != null && pC > 0.05) fallos.push(`el azar compra la racha igual de barata el ${(pC * 100).toFixed(1)}% de las veces`);
  return { sirve: fallos.length === 0, por: fallos.join(" · ") };
};
for (const r of REGLAS) r.ver = criterio(r);

const sirven = REGLAS.filter((r) => r.ver.sirve);
console.log(`\n${"═".repeat(120)}`);
console.log(`  VEREDICTO: ${sirven.length} de ${REGLAS.length} reglas corridas pasan (divisor declarado ${PRUEBAS})`);
console.log(`${"═".repeat(120)}\n`);
if (!sirven.length) {
  // LA MEJOR CANDIDATA y QUÉ LE FALTA — nunca un "no pasó" a secas.
  const conRacha = REGLAS.filter((r) => r.ddElim > 0 && r.coste != null).sort((a, b) => a.coste - b.coste);
  const masRacha = [...REGLAS].sort((a, b) => b.ddElim - a.ddElim);
  console.log("  Ninguna. Las tres que más cerca se quedan:\n");
  for (const r of [conRacha[0], masRacha[0], [...REGLAS].sort((a, b) => b.m.peor - a.m.peor)[0]].filter((x, i, a) => x && a.indexOf(x) === i)) {
    console.log(`  · ${r.nom} — ${r.desc}`);
    console.log(`      para ${r.m.nPara} días · ${eur(r.m.alAno)}/año (${((r.m.alAno / BASE.alAno) * 100).toFixed(0)}%) · peor día ${eur(r.m.peor)} · racha ${eur(r.m.dd)} (quita ${eur(r.ddElim)})`);
    console.log(`      coste ${r.coste == null ? "—" : "$" + r.coste.toFixed(2) + " de ingreso anual por cada $1 de racha"} · p(racha) ${(r.fino ?? r.ctrl).p.dd.toFixed(4)} · p(episodios) ${r.ctrlB.p.dd.toFixed(4)}`);
    console.log(`      LE FALTA: ${r.ver.por}\n`);
  }
} else {
  for (const r of sirven) {
    console.log(`  🟢 ${r.nom} — ${r.desc}`);
    console.log(`      para ${r.m.nPara} días en ${r.eps.length} episodios · ${eur(r.m.alAno)}/año (${((r.m.alAno / BASE.alAno) * 100).toFixed(0)}% del ingreso)`);
    console.log(`      peor día ${eur(BASE.peor)} → ${eur(r.m.peor)} · peor racha ${eur(BASE.dd)} → ${eur(r.m.dd)} · coste $${r.coste.toFixed(2)}/$ · signos ${r.signos}`);
    console.log(`      p(racha) ${(r.fino ?? r.ctrl).p.dd.toFixed(5)} · p(episodios al azar) ${r.ctrlB.p.dd.toFixed(4)} · p(coste) ${((r.fino ?? r.ctrl).p.coste ?? NaN).toFixed(5)}\n`);
  }
}

writeFileSync("scripts/parar-y-volver.json", JSON.stringify({
  base: BASE, anos: ANOS, pruebasDeclaradas: PRUEBAS, listonT: LISTON, sorteos: SORTEOS, sorteosFino: SORTEOS_FINO,
  reglas: REGLAS.map((r) => ({
    fam: r.fam, nom: r.nom, desc: r.desc, m: r.m, episodios: r.eps, ddElim: r.ddElim, coste: r.coste,
    t: r.t, signos: r.signos, p: r.ctrl?.p ?? null, pBloques: r.ctrlB?.p ?? null, pFino: r.fino?.p ?? null,
    sirve: r.ver.sirve, leFalta: r.ver.por,
  })),
}, null, 2), "utf8");
console.log("  detalle en scripts/parar-y-volver.json");
