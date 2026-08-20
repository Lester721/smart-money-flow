// ANATOMÍA 3 · EL RETRATO ROBOT DE UN DÍA MALO
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/anatomia3-retrato.mjs
//
// ═══ EN QUÉ SE DIFERENCIA DE LAS 17 PRUEBAS DE RÉGIMEN Y LAS 30 DE GESTIÓN ═══════════════════
//
// Aquéllas midieron el tercio alto contra el tercio bajo del P&L MEDIO. Todas fallaron, y el
// porqué está en memoria: el crédito compensa el riesgo extra, así que la media sale plana.
//
// Aquí NO se mide la media. Se mide la COLA. Lester quiere reducir la caída, no subir la media:
// un filtro que deje los $18.770/año intactos y parta el peor día por la mitad es un éxito.
//
// ═══ LAS PRUEBAS, DECLARADAS ANTES DE CORRER ═════════════════════════════════════════════════
//
// 28 señales continuas + 4 categóricas = 32 en este fichero. Pero el divisor del listón NO es 32:
// es TODO lo que se ha probado sobre estos mismos 653 días — 17 filtros de régimen + 30 reglas de
// gestión ya corridos antes, más las 132 comparaciones de esta anatomía (32 aquí + 84 del barrido
// + 5 reglas + 8 del veredicto + 3 de frecuencia de cola). Total 180.
//   listonT(180) ≈ 3,64. Se pone ALTO a propósito: si no se sabe el número, se sube, no se baja.
//
// ═══ LA REGLA DE ORO ═════════════════════════════════════════════════════════════════════════
// TODO observable a las 11:00 ET o antes. Los índices de volatilidad entran SIEMPRE con el
// cierre de AYER: el de hoy son cinco horas de futuro.
//
// ═══ LO QUE ESTO NO ES ═══════════════════════════════════════════════════════════════════════
// No es una lista de hallazgos. Con 30 días por lado, una diferencia de medias no demuestra nada
// — por eso cada señal lleva su t Y el tamaño de muestra que haría falta para verla de verdad.
// El objetivo es generar hipótesis para la fase siguiente.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tWelch, listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const PRUEBAS = 180;                       // DECLARADO DE ANTEMANO. No se toca.
const LISTON = listonT(PRUEBAS);
const N_COLA = 30;                        // los 30 peores contra los 30 mejores
const VDIR = "scripts/cache-theta/vol-indices";

const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };

/** Peor racha acumulada: máxima caída de pico a valle de la curva de P&L acumulado. */
function drawdown(pls) {
  let acc = 0, pico = 0, peor = 0;
  for (const p of pls) { acc += p; if (acc > pico) pico = acc; const dd = acc - pico; if (dd < peor) peor = dd; }
  return peor;
}

// ── CARGA ───────────────────────────────────────────────────────────────────
const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const CAM = JSON.parse(readFileSync("scripts/anatomia3-camino.json", "utf8"));
const V = {};
for (const s of ["VIX", "VIX9D", "VIX3M", "VVIX"]) {
  const f = `${VDIR}/${s}.json`;
  if (existsSync(f)) V[s] = JSON.parse(readFileSync(f, "utf8"));
  else console.log(`⚠️ NO EXISTE ${f} — las señales que dependan de ${s} quedarán en null y se dirá`);
}
const clave = (f) => f.replace(/-/g, "");
/** Último cierre ESTRICTAMENTE anterior a la fecha. El de hoy sería futuro. */
const anterior = (serie, fecha, n) => {
  const d = clave(fecha), ks = Object.keys(serie).filter((k) => k < d).sort();
  return ks.length >= n ? serie[ks[ks.length - n]] : null;
};

filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
console.log(`## ${filas.length} días · ${filas[0].fecha} → ${filas[filas.length - 1].fecha}`);
const ANOS = filas.length / 251;

// ── COMPROBACIÓN DE INTEGRIDAD: ¿el camino cuadra con lo ya calculado? ──────
let desajustes = 0;
for (const f of filas) {
  const c = CAM[f.fecha];
  if (!c) { desajustes++; continue; }
  const i11 = c.h.indexOf("11:00");
  if (i11 < 0) { desajustes++; continue; }
  if (Math.abs(c.s[i11] - f.sp11) > 0.01 || Math.abs(c.s[c.s.length - 1] - f.cierre) > 0.01) desajustes++;
}
if (desajustes) throw new Error(`${desajustes} días donde el camino no cuadra con regimen-filas.json — no se mide con esto`);
console.log(`   ✓ el camino de 5 minutos cuadra con sp11 y cierre en los ${filas.length} días`);

// ── MEDIA SESIÓN: aviso de calidad de dato ─────────────────────────────────
// En las sesiones de media jornada el mercado cierra a las 13:00, pero el fichero trae marcas
// hasta las 16:00. Si el proveedor las rellena con algo que se mueve, el "cierre" del backtest
// no es el de liquidación. Se cuenta y se DICE; no se corrige aquí porque el P&L ya está fijado.
const mediaSesion = [];
for (const f of filas) {
  const c = CAM[f.fecha], i13 = c.h.indexOf("13:00");
  const post = c.s.slice(i13).map((x, i, a) => (i ? Math.abs(x / a[i - 1] - 1) : 0));
  const mueve = Math.max(...post);
  // día de media sesión conocido: 3-jul, víspera de Navidad, viernes de Acción de Gracias
  const md = f.fecha.slice(5);
  if (md === "07-03" || md === "12-24" || (f.dow === 5 && f.fecha.slice(5, 7) === "11" && +f.dia >= 23 && +f.dia <= 29)) {
    mediaSesion.push({ fecha: f.fecha, s13: c.s[i13], s16: c.s[c.s.length - 1], mueve: mueve * 100, pl: f.pl });
  }
}

// ── FASE A · las señales, todas observables a las 11:00 ─────────────────────
for (let i = 0; i < filas.length; i++) {
  const f = filas[i], ant = filas[i - 1], ant2 = filas[i - 2];
  const c = CAM[f.fecha];
  const i11 = c.h.indexOf("11:00");
  const s = c.s.slice(0, i11 + 1);            // 09:35 → 11:00, 18 marcas
  const ivs = c.iv.slice(0, i11 + 1);

  // ── FORMA del recorrido de la mañana ──
  let camino = 0, giros = 0, dirPrev = 0;
  const rets = [];
  for (let j = 1; j < s.length; j++) {
    const d = s[j] - s[j - 1];
    camino += Math.abs(d);
    rets.push(Math.log(s[j] / s[j - 1]));
    const dir = Math.sign(d);
    if (dir !== 0) { if (dirPrev !== 0 && dir !== dirPrev) giros++; dirPrev = dir; }
  }
  const neto = s[s.length - 1] - s[0];
  f.movManana = (f.sp11 / f.ap - 1) * 100;                       // SIGNADO
  f.movMananaAbs = Math.abs(f.movManana);
  f.rangoManana = ((f.maxM - f.minM) / f.sp11) * 100;
  f.posRango = f.maxM > f.minM ? (f.sp11 - f.minM) / (f.maxM - f.minM) : 0.5;
  f.extremo = Math.abs(f.posRango - 0.5) * 2;
  f.recorrido = (camino / f.sp11) * 100;                         // longitud del camino, en %
  f.eficiencia = camino > 0 ? Math.abs(neto) / camino : 0;       // 1 = línea recta, 0 = ida y vuelta
  f.zigzag = giros;                                              // cambios de dirección en 5 min
  f.rvManana = sd(rets) * Math.sqrt(78 * 252) * 100;             // vol realizada de la mañana, anualizada %
  const i1030 = c.h.indexOf("10:30");
  f.acel = i1030 >= 0 ? Math.abs(f.sp11 / c.s[i1030] - 1) * 100 : null;   // última media hora

  // ── IV del dinero ──
  const iv11 = ivs[i11], iv0 = ivs.find((x) => x != null);
  f.ivAtm11 = iv11 != null ? iv11 * 100 : null;
  f.ivCambio = iv11 != null && iv0 ? (iv11 / iv0 - 1) * 100 : null;
  f.sigmaRatio = f.sigma ? 25 / f.sigma : null;                  // cuántas σ son los ±25 fijos
  f.rvIv = f.ivAtm11 ? f.rvManana / f.ivAtm11 : null;            // realizada de la mañana / implícita

  // ── hueco y AYER (sesión entera de ayer, no sólo su mañana) ──
  f.hueco = ant ? (f.ap / ant.cierre - 1) * 100 : null;          // SIGNADO
  f.huecoAbs = f.hueco != null ? Math.abs(f.hueco) : null;
  if (ant) {
    const ca = CAM[ant.fecha];
    f.rangoAyerReal = ((Math.max(...ca.s) - Math.min(...ca.s)) / ant.cierre) * 100;
    const ra = [];
    for (let j = 1; j < ca.s.length; j++) ra.push(Math.log(ca.s[j] / ca.s[j - 1]));
    f.rvAyer = sd(ra) * Math.sqrt(78 * 252) * 100;
  } else { f.rangoAyerReal = null; f.rvAyer = null; }
  f.retAyer = ant && ant2 ? (ant.cierre / ant2.cierre - 1) * 100 : null;

  // ── índices de volatilidad, SIEMPRE cierre de AYER ──
  f.vix = V.VIX ? anterior(V.VIX, f.fecha, 1) : null;
  const vix2 = V.VIX ? anterior(V.VIX, f.fecha, 2) : null;
  f.vixCambio = f.vix && vix2 ? (f.vix / vix2 - 1) * 100 : null;
  const v9 = V.VIX9D ? anterior(V.VIX9D, f.fecha, 1) : null;
  const v3m = V.VIX3M ? anterior(V.VIX3M, f.fecha, 1) : null;
  const vv = V.VVIX ? anterior(V.VVIX, f.fecha, 1) : null;
  f.term9 = f.vix && v9 ? v9 / f.vix : null;
  f.term3m = f.vix && v3m ? f.vix / v3m : null;
  f.vvix = vv;
  f.vvixVix = vv && f.vix ? vv / f.vix : null;
  f.ivVsVix = f.ivAtm11 && f.vix ? f.ivAtm11 / f.vix : null;

  // ── calendario ──
  const dsem = new Date(f.fecha + "T00:00:00Z").getUTCDay();
  f.opex = (f.dia >= 15 && f.dia <= 21 && dsem === 5) ? 1 : 0;
  f.empleo = (f.dia <= 7 && dsem === 5) ? 1 : 0;
  f.finMes = (!filas[i + 1] || filas[i + 1].fecha.slice(5, 7) !== f.fecha.slice(5, 7)) ? 1 : 0;
}

// EL GUARDIÁN — un campo muerto se lee como 0 y se mide durante horas sin enterarse.
radiografia(filas, [
  "pl", "credito", "sigma", "movManana", "movMananaAbs", "rangoManana", "posRango", "extremo",
  "recorrido", "eficiencia", "zigzag", "rvManana", "acel", "ivAtm11", "ivCambio", "sigmaRatio",
  "rvIv", "hueco", "huecoAbs", "rangoAyerReal", "rvAyer", "retAyer", "vix", "vixCambio",
  "term9", "term3m", "vvix", "vvixVix", "ivVsVix",
], "días del cóndor + camino", { maxCeros: 0.2 });

// ── LÍNEA BASE ──────────────────────────────────────────────────────────────
const PL = filas.map((f) => f.pl);
const BASE = {
  n: filas.length, total: PL.reduce((a, b) => a + b, 0), media: media(PL),
  peor: Math.min(...PL), p1: pct(PL, 0.01), p5: pct(PL, 0.05), dd: drawdown(PL),
  acierto: PL.filter((x) => x > 0).length / PL.length,
};
BASE.alAno = BASE.total / ANOS;
console.log("\n" + "═".repeat(100));
console.log("  LÍNEA BASE · cóndor de 1 contrato, entrada 11:00, todos los días");
console.log("═".repeat(100));
console.log(`  n=${BASE.n} · ${ANOS.toFixed(2)} años · total ${eur(BASE.total)} · ${eur(BASE.alAno)}/año · media ${eur(BASE.media)}/op · acierto ${(BASE.acierto * 100).toFixed(1)}%`);
console.log(`  PEOR DÍA ${eur(BASE.peor)} · p1 ${eur(BASE.p1)} · p5 ${eur(BASE.p5)} · PEOR RACHA ${eur(BASE.dd)}`);

if (mediaSesion.length) {
  console.log(`\n  ⚠️ CALIDAD DE DATO — ${mediaSesion.length} sesiones de MEDIA JORNADA (cierre real 13:00) traen marcas hasta las 16:00:`);
  for (const m of mediaSesion) console.log(`     ${m.fecha}  13:00 ${m.s13.toFixed(2)} → 16:00 ${m.s16.toFixed(2)}  (${(m.s16 - m.s13).toFixed(2)} pts)  P&L ${eur(m.pl)}`);
  console.log(`     Se DICE, no se corrige: el P&L de esos días liquida contra la marca de las 16:00, que puede no ser la de cierre real.`);
}

// ── FASE B · EL RETRATO ROBOT ───────────────────────────────────────────────
const ord = [...filas].sort((a, b) => a.pl - b.pl);
const PEOR = ord.slice(0, N_COLA), MEJOR = ord.slice(-N_COLA);
const CONT = [
  ["camino", "movManana", "% de la apertura a las 11:00 (SIGNADO)"],
  ["camino", "movMananaAbs", "lo mismo en valor absoluto"],
  ["camino", "rangoManana", "% de rango alto-bajo de la mañana"],
  ["camino", "posRango", "dónde queda a las 11:00 dentro del rango (0=suelo, 1=techo)"],
  ["camino", "extremo", "qué tan al BORDE de ese rango (0=centro, 1=en el extremo)"],
  ["camino", "recorrido", "% de camino andado sumando los 17 tramos de 5 min"],
  ["camino", "eficiencia", "neto / camino (1 = línea recta, 0 = ida y vuelta)"],
  ["camino", "zigzag", "nº de cambios de dirección en la mañana"],
  ["camino", "rvManana", "vol realizada de la mañana, anualizada %"],
  ["camino", "acel", "% movido en la última media hora (10:30→11:00)"],
  ["precio", "ivAtm11", "implícita del dinero a las 11:00, %"],
  ["precio", "ivCambio", "% que cambió esa implícita desde las 09:35"],
  ["precio", "sigma", "movimiento esperado del resto de sesión, en puntos"],
  ["precio", "sigmaRatio", "cuántas σ son los ±25 fijos"],
  ["precio", "rvIv", "vol realizada de la mañana / implícita (>1 = se mueve más de lo que paga)"],
  ["crédito", "credito", "$ cobrados por el cóndor"],
  ["ayer", "hueco", "% de hueco de apertura contra el cierre de ayer (SIGNADO)"],
  ["ayer", "huecoAbs", "lo mismo en valor absoluto"],
  ["ayer", "rangoAyerReal", "% de rango de la SESIÓN ENTERA de ayer"],
  ["ayer", "rvAyer", "vol realizada de la sesión entera de ayer, anualizada %"],
  ["ayer", "retAyer", "% que se movió ayer de cierre a cierre"],
  ["vol", "vix", "VIX al cierre de AYER"],
  ["vol", "vixCambio", "% que cambió el VIX ayer"],
  ["vol", "term9", "VIX9D / VIX de ayer (>1 = estrés a corto)"],
  ["vol", "term3m", "VIX / VIX3M de ayer (>1 = curva invertida)"],
  ["vol", "vvix", "VVIX al cierre de AYER"],
  ["vol", "vvixVix", "VVIX / VIX de ayer"],
  ["vol", "ivVsVix", "implícita 0DTE de las 11:00 / VIX de ayer"],
];
const BIN = [["cal", "opex", "tercer viernes"], ["cal", "empleo", "primer viernes"], ["cal", "finMes", "último día del mes"]];

console.log("\n" + "═".repeat(100));
console.log(`  RETRATO ROBOT · los ${N_COLA} PEORES contra los ${N_COLA} MEJORES · listón |t| ≥ ${LISTON} (Bonferroni ${PRUEBAS})`);
console.log("═".repeat(100));
console.log(`  peores: P&L medio ${eur(media(PEOR.map((f) => f.pl)))} (de ${eur(PEOR[0].pl)} a ${eur(PEOR[N_COLA - 1].pl)})`);
console.log(`  mejores: P&L medio ${eur(media(MEJOR.map((f) => f.pl)))}`);
console.log("\n| grupo | señal | 30 PEORES | 30 MEJORES | dif | t | n/grupo que haría falta | qué es |");
console.log("|---|---|---|---|---|---|---|---|");

const retrato = [];
for (const [g, campo, desc] of CONT) {
  const a = PEOR.map((f) => f[campo]).filter((x) => x != null && isFinite(x));
  const b = MEJOR.map((f) => f[campo]).filter((x) => x != null && isFinite(x));
  if (a.length < 10 || b.length < 10) { console.log(`| ${g} | \`${campo}\` | — | — | — | — | — | SIN MUESTRA (${a.length}/${b.length}) |`); continue; }
  const t = tWelch(a, b), dif = media(a) - media(b);
  // n por grupo para ver ESTA diferencia con potencia 80% al listón de Bonferroni
  const sPool = Math.sqrt((sd(a) ** 2 + sd(b) ** 2) / 2);
  const nNec = dif !== 0 ? Math.ceil(2 * ((LISTON + 0.84) ** 2) * (sPool ** 2) / (dif ** 2)) : Infinity;
  const dec = Math.abs(media(a)) < 10 ? 3 : 2;
  retrato.push({ g, campo, desc, peor: media(a), mejor: media(b), dif, t, nNec });
  console.log(`| ${g} | \`${campo}\` | ${media(a).toFixed(dec)} | ${media(b).toFixed(dec)} | ${dif.toFixed(dec)} | **${t.toFixed(2)}** | ${isFinite(nNec) ? nNec : "—"} | ${desc} |`);
}
for (const [g, campo, desc] of BIN) {
  const a = PEOR.filter((f) => f[campo] === 1).length, b = MEJOR.filter((f) => f[campo] === 1).length;
  const t = tWelch(PEOR.map((f) => f[campo]), MEJOR.map((f) => f[campo]));
  retrato.push({ g, campo, desc, peor: a / N_COLA, mejor: b / N_COLA, dif: (a - b) / N_COLA, t, nNec: null });
  console.log(`| ${g} | \`${campo}\` | ${a} de ${N_COLA} | ${b} de ${N_COLA} | ${a - b} | **${t.toFixed(2)}** | — | ${desc} |`);
}
const dowP = [1, 2, 3, 4, 5].map((d) => PEOR.filter((f) => f.dow === d).length);
const dowM = [1, 2, 3, 4, 5].map((d) => MEJOR.filter((f) => f.dow === d).length);
console.log(`| cal | \`dow\` | L${dowP[0]} M${dowP[1]} X${dowP[2]} J${dowP[3]} V${dowP[4]} | L${dowM[0]} M${dowM[1]} X${dowM[2]} J${dowM[3]} V${dowM[4]} | — | — | — | día de la semana |`);

console.log("\n  ⚠️ NADA DE ESTA TABLA ES UN HALLAZGO. Con 30 por lado, |t| ≥ " + LISTON + " es el mínimo para mirar,");
console.log("     y aun así una diferencia de medias sobre las colas se puede fabricar sola. La columna");
console.log("     'n que haría falta' dice cuántos días por lado harían falta para verla de verdad.");

writeFileSync("scripts/anatomia3-retrato.json", JSON.stringify({ BASE, retrato, mediaSesion }, null, 2), "utf8");
console.log("\n  detalle en scripts/anatomia3-retrato.json");
