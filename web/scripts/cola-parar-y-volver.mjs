// ¿HAY UNA PARADA QUE CORTE LA COLA? — 35 reglas de PARAR Y VOLVER sobre el cóndor 0DTE.
//
// ═══ EN QUÉ SE DIFERENCIA DE regimen-18 Y DE LAS 30 REGLAS DE GESTIÓN ════════════════════════
// Aquellas se midieron contra la MEDIA (tercio alto contra tercio bajo del P&L medio) y todas
// fallaron. Aquí NO se optimiza la media: se optimiza la COLA. Un filtro que deje la media igual
// y parta el peor día por la mitad ES UN ÉXITO. Lo que se mide:
//     · PEOR DÍA, percentil 1 y percentil 5 del P&L diario
//     · PEOR RACHA ACUMULADA (drawdown de pico a valle sobre la curva acumulada)
//     · $/año retenidos  →  la métrica que decide es $ de caída eliminada por cada $/año cedido
//
// ═══ EL CONTROL QUE DECIDE ══════════════════════════════════════════════════════════════════
// Cualquier regla que pare D días baja la caída. También la baja PARAR D DÍAS AL AZAR. Por eso
// cada regla se compara contra 500 sorteos de D días elegidos al azar (semilla fija). Si el azar
// la domina —menos caída Y más dinero— con probabilidad ≥5%, la regla no existe: lo único que
// estaba haciendo era operar menos.
//
// ═══ LA REGLA DE ORO ════════════════════════════════════════════════════════════════════════
// Todo lo que decide la entrada es observable a las 11:00 ET. El VIX entra SIEMPRE con el cierre
// de AYER (el de hoy son 5 horas de futuro). Las reglas reactivas (tras pérdida, tras racha, tras
// mes malo) sólo miran días YA CERRADOS y sólo cuentan pérdidas REALMENTE incurridas: si la regla
// tenía la operación parada, ese día no genera señal porque no se operó.
//
// LAS 35 PRUEBAS SE DECLARAN ANTES DE CORRER. El divisor no se toca.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tWelch, listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const PRUEBAS = 35;                    // DECLARADO DE ANTEMANO
const LISTON = listonT(PRUEBAS);
const SORTEOS = 500;
const DIAS_ANO = 252;
const SEMILLA = 20260819;

const eur = (x) => (x == null || !isFinite(x)) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (x) => (x * 100).toFixed(1) + "%";

// ── DATOS ───────────────────────────────────────────────────────────────────
const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
console.log("## " + filas.length + " días · " + filas[0].fecha + " → " + filas[filas.length - 1].fecha);

// EL GUARDIÁN: un campo muerto se lee como 0 y se mide durante horas sin enterarse.
radiografia(filas, ["pl", "credito", "cierre", "ap", "sp11", "sigma"], "días del cóndor", { maxCeros: 0.2 });

const VDIR = "scripts/cache-theta/vol-indices";
const V = {};
for (const s of ["VIX", "VIX9D", "VIX3M", "VVIX"]) {
  const f = VDIR + "/" + s + ".json";
  if (existsSync(f)) V[s] = JSON.parse(readFileSync(f, "utf8"));
  else console.log("   ⚠️ NO EXISTE " + f + " — las reglas que lo usan quedan SIN CORRER");
}
// ÚLTIMO cierre ESTRICTAMENTE anterior. El de HOY liquida a las 16:00: sería futuro.
const anterior = (serie, fecha) => {
  const d = fecha.replace(/-/g, "");
  const ks = Object.keys(serie).filter((k) => k < d).sort();
  return ks.length ? serie[ks[ks.length - 1]] : null;
};
for (const f of filas) f.vixAyer = V.VIX ? anterior(V.VIX, f.fecha) : null;
const sinVix = filas.filter((f) => f.vixAyer == null).length;
console.log("   VIX de ayer disponible en " + (filas.length - sinVix) + " de " + filas.length + " días" +
            (sinVix ? " · " + sinVix + " SIN DATO (esos días se opera, y se dice)" : ""));
radiografia(filas, ["vixAyer"], "VIX del cierre de ayer");

const PL = filas.map((f) => f.pl);
const N = PL.length;

// ── MÉTRICAS ────────────────────────────────────────────────────────────────
// La normalización del $/año es sobre TODO el período (no sobre los días operados): el calendario
// no se para porque nosotros paremos. Parar días BAJA el $/año, y eso es exactamente lo que hay
// que ver contra la caída que ahorra.
function metricas(mask) {
  let acum = 0, pico = 0, dd = 0, tot = 0, gan = 0;
  const d = [];
  for (let i = 0; i < N; i++) {
    if (mask[i]) { d.push(PL[i]); tot += PL[i]; if (PL[i] > 0) gan++; acum += PL[i]; }
    if (acum > pico) pico = acum;
    if (pico - acum > dd) dd = pico - acum;
  }
  const o = [...d].sort((a, b) => a - b);
  const q = (p) => (o.length ? o[Math.min(o.length - 1, Math.floor(o.length * p))] : NaN);
  return {
    opera: d.length, para: N - d.length, tot,
    porAno: (tot / N) * DIAS_ANO,
    porOp: d.length ? tot / d.length : NaN,
    peorDia: o.length ? o[0] : NaN,
    p1: q(0.01), p5: q(0.05), dd,
    acierto: d.length ? gan / d.length : NaN,
  };
}

const TODO = new Array(N).fill(true);
const BASE = metricas(TODO);

// ── LAS REGLAS · 35, declaradas antes de correr ─────────────────────────────
// A · parar N días tras una pérdida mayor de $X   (4 umbrales × 5 pausas = 20)
function trasPerdida(X, dias) {
  const m = new Array(N).fill(true);
  let pausa = 0;
  for (let i = 0; i < N; i++) {
    if (pausa > 0) { m[i] = false; pausa--; continue; }
    m[i] = true;
    if (PL[i] < -X) pausa = dias;      // la pérdida se conoce al cierre → para desde MAÑANA
  }
  return m;
}
// B · parar mientras el VIX de AYER esté por encima del umbral (5 umbrales = 5)
function vixAlto(u) {
  return filas.map((f) => !(f.vixAyer != null && f.vixAyer > u));
}
// C · parar el resto del mes tras perder más de $X en el mes (4 umbrales = 4)
function mesMalo(X) {
  const m = new Array(N).fill(true);
  let mes = "", acum = 0, parado = false;
  for (let i = 0; i < N; i++) {
    const k = filas[i].fecha.slice(0, 7);
    if (k !== mes) { mes = k; acum = 0; parado = false; }
    if (parado) { m[i] = false; continue; }
    m[i] = true; acum += PL[i];
    if (acum < -X) parado = true;
  }
  return m;
}
// D · parar M días tras una racha de R días perdedores seguidos (2 rachas × 3 pausas = 6)
function trasRacha(R, dias) {
  const m = new Array(N).fill(true);
  let racha = 0, pausa = 0;
  for (let i = 0; i < N; i++) {
    if (pausa > 0) { m[i] = false; pausa--; continue; }
    m[i] = true;
    if (PL[i] < 0) racha++; else racha = 0;
    if (racha >= R) { pausa = dias; racha = 0; }
  }
  return m;
}

const REGLAS = [];
for (const X of [500, 1000, 2000, 3000]) for (const d of [1, 2, 3, 5, 10])
  REGLAS.push({ fam: "A", nom: `parar ${d}d tras perder >${eur(X)}`, mask: trasPerdida(X, d) });
for (const u of [16, 18, 20, 22, 25])
  REGLAS.push({ fam: "B", nom: `no operar si VIX(ayer) > ${u}`, mask: vixAlto(u) });
for (const X of [1000, 2000, 3000, 5000])
  REGLAS.push({ fam: "C", nom: `cerrar el mes tras perder >${eur(X)} en él`, mask: mesMalo(X) });
for (const R of [2, 3]) for (const d of [1, 3, 5])
  REGLAS.push({ fam: "D", nom: `parar ${d}d tras ${R} días perdedores seguidos`, mask: trasRacha(R, d) });

if (REGLAS.length !== PRUEBAS) throw new Error("declaré " + PRUEBAS + " pruebas y construí " + REGLAS.length + " — el divisor NO se ajusta a posteriori, se arregla la lista");

// ── EL CONTROL DEL AZAR ─────────────────────────────────────────────────────
let semilla = SEMILLA;
const rnd = () => { semilla |= 0; semilla = (semilla + 0x6D2B79F5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const cacheAzar = new Map();
function azar(k) {
  if (cacheAzar.has(k)) return cacheAzar.get(k);
  const out = [];
  const idx = [...Array(N).keys()];
  for (let s = 0; s < SORTEOS; s++) {
    for (let j = 0; j < k; j++) { const r = j + Math.floor(rnd() * (N - j)); const t = idx[j]; idx[j] = idx[r]; idx[r] = t; }
    const m = new Array(N).fill(true);
    for (let j = 0; j < k; j++) m[idx[j]] = false;
    out.push(metricas(m));
  }
  cacheAzar.set(k, out);
  return out;
}

// ── MEDIR ───────────────────────────────────────────────────────────────────
const R = [];
for (const r of REGLAS) {
  const m = metricas(r.mask);
  const off = PL.filter((_, i) => !r.mask[i]);
  const on = PL.filter((_, i) => r.mask[i]);
  // t de Welch: ¿los días que se dejan de operar eran de verdad peores? t negativa = sí.
  const t = off.length >= 3 && on.length >= 3 ? tWelch(off, on) : NaN;

  const ctrl = m.para > 0 ? azar(m.para) : [];
  // ¿cuántos sorteos DOMINAN a la regla? menos caída Y más dinero al año.
  const domina = ctrl.length ? ctrl.filter((c) => c.dd <= m.dd && c.porAno >= m.porAno).length / ctrl.length : NaN;
  const mejorDD = ctrl.length ? ctrl.filter((c) => c.dd <= m.dd).length / ctrl.length : NaN;
  const mejorAno = ctrl.length ? ctrl.filter((c) => c.porAno >= m.porAno).length / ctrl.length : NaN;
  const mejorPeor = ctrl.length ? ctrl.filter((c) => c.peorDia >= m.peorDia).length / ctrl.length : NaN;

  const ddAhorrada = BASE.dd - m.dd;
  const anoCedido = BASE.porAno - m.porAno;
  const efic = anoCedido > 0 ? ddAhorrada / anoCedido : (ddAhorrada > 0 ? Infinity : NaN);
  const eficAzar = ctrl.length ? ctrl.map((c) => {
    const a = BASE.porAno - c.porAno; const b = BASE.dd - c.dd;
    return a > 0 ? b / a : (b > 0 ? Infinity : 0);
  }).sort((a, b) => a - b)[Math.floor(ctrl.length / 2)] : NaN;

  R.push({ ...r, m, t, domina, mejorDD, mejorAno, mejorPeor, ddAhorrada, anoCedido, efic, eficAzar });
}

// ── SALIDA ──────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(120));
console.log("  35 REGLAS DE PARADA · listón de |t| = " + LISTON + " (Bonferroni sobre " + PRUEBAS + ") · control: " + SORTEOS + " sorteos del azar");
console.log("═".repeat(120));
console.log("\n## LA BASE (operar los 653 días, 1 contrato)\n");
console.log("| n | $/año | $/op | acierto | PEOR DÍA | p1 | p5 | PEOR RACHA |");
console.log("|---|---|---|---|---|---|---|---|");
console.log("| " + BASE.opera + " | " + eur(BASE.porAno) + " | " + eur(BASE.porOp) + " | " + pct(BASE.acierto) + " | **" +
            eur(BASE.peorDia) + "** | " + eur(BASE.p1) + " | " + eur(BASE.p5) + " | **" + eur(BASE.dd) + "** |");

// diagnóstico del mecanismo: ¿se agrupan las pérdidas? Sin agrupamiento, ninguna regla reactiva
// puede funcionar, y conviene saberlo ANTES de leer 35 filas de tabla.
console.log("\n## ¿SE AGRUPAN LAS PÉRDIDAS? — el mecanismo del que dependen las familias A, C y D\n");
const rho = (() => { const a = PL.slice(0, -1), b = PL.slice(1), ma = media(a), mb = media(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db); })();
console.log("| medida | valor |");
console.log("|---|---|");
console.log("| autocorrelación del P&L diario (lag 1) | " + rho.toFixed(3) + " |");
for (const X of [1000, 2000, 3000]) {
  const base = PL.filter((p) => p < -X).length / N;
  const tras = PL.slice(1).filter((p, i) => PL[i] < -X && p < -X).length / Math.max(1, PL.slice(0, -1).filter((p) => p < -X).length);
  const nTras = PL.slice(0, -1).filter((p) => p < -X).length;
  console.log("| P(perder >" + eur(X) + ") en general vs. el día DESPUÉS de perder >" + eur(X) + " (n=" + nTras + ") | " + pct(base) + " → " + pct(tras) + " |");
}
const mediaTrasPerdida = media(PL.slice(1).filter((_, i) => PL[i] < -1000));
console.log("| P&L medio del día siguiente a una pérdida >$1.000 | " + eur(mediaTrasPerdida) + " (base " + eur(BASE.porOp) + ") |");

console.log("\n## LAS 35 REGLAS\n");
console.log("| fam | regla | días parados | $/año | Δ$/año | PEOR DÍA | p1 | p5 | PEOR RACHA | Δcaída | $caída/$año | t | azar la domina | ¿aporta? |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of R) {
  const aporta = r.m.para > 0 && r.domina < 0.05 && r.ddAhorrada > 0;
  console.log("| " + r.fam + " | " + r.nom + " | " + r.m.para + " | " + eur(r.m.porAno) + " | " + eur(r.m.porAno - BASE.porAno) +
    " | " + eur(r.m.peorDia) + " | " + eur(r.m.p1) + " | " + eur(r.m.p5) + " | " + eur(r.m.dd) + " | " + eur(r.ddAhorrada) +
    " | " + (isFinite(r.efic) ? r.efic.toFixed(2) : (r.efic === Infinity ? "∞ (gratis)" : "—")) +
    " | " + (isFinite(r.t) ? r.t.toFixed(2) : "—") + " | " + (isFinite(r.domina) ? pct(r.domina) : "—") +
    " | " + (aporta ? "🟢 **SÍ**" : "no") + " |");
}

// ── EL VEREDICTO ────────────────────────────────────────────────────────────
const pasan = R.filter((r) => r.m.para > 0 && r.domina < 0.05 && r.ddAhorrada > 0);
console.log("\n" + "═".repeat(120));
console.log("  VEREDICTO: " + pasan.length + " de " + PRUEBAS + " reglas le ganan al azar");
console.log("═".repeat(120));

// la mejor por eficiencia entre las que de verdad recortan caída
const conRecorte = R.filter((r) => r.ddAhorrada > 0 && r.m.para > 0);
const mejor = conRecorte.slice().sort((a, b) => (b.efic || 0) - (a.efic || 0))[0];
const mejorAzar = R.slice().sort((a, b) => (a.domina ?? 1) - (b.domina ?? 1))[0];

function tercios(r) {
  const k = Math.floor(N / 3), out = [];
  for (let i = 0; i < 3; i++) {
    const a = i * k, b = i < 2 ? (i + 1) * k : N;
    const off = [], on = [];
    for (let j = a; j < b; j++) (r.mask[j] ? on : off).push(PL[j]);
    // signo + = en ese tercio los días parados eran PEORES que los operados (parar ayudó)
    out.push({ periodo: filas[a].fecha + "→" + filas[b - 1].fecha, nOff: off.length,
               mOff: off.length ? media(off) : NaN, mOn: on.length ? media(on) : NaN,
               signo: off.length && media(off) < media(on) ? "+" : "−" });
  }
  return out;
}

for (const [etiqueta, r] of [["MÁS EFICIENTE (más caída por cada $/año cedido)", mejor], ["LA QUE MEJOR AGUANTA AL AZAR", mejorAzar]]) {
  if (!r) continue;
  console.log("\n### " + etiqueta + ": " + r.nom);
  console.log("  para " + r.m.para + " de " + N + " días (" + pct(r.m.para / N) + ") · " + eur(r.m.porAno) + "/año (base " + eur(BASE.porAno) + ")");
  console.log("  peor día " + eur(r.m.peorDia) + " (base " + eur(BASE.peorDia) + ") · peor racha " + eur(r.m.dd) + " (base " + eur(BASE.dd) + ")");
  console.log("  eficiencia: " + (isFinite(r.efic) ? "$" + r.efic.toFixed(2) : String(r.efic)) + " de caída por cada $1 de renta anual cedida · el AZAR con los mismos días parados da la mediana en $" + (isFinite(r.eficAzar) ? r.eficAzar.toFixed(2) : String(r.eficAzar)));
  console.log("  el azar la domina en " + pct(r.domina) + " de los " + SORTEOS + " sorteos · azar con menos caída " + pct(r.mejorDD) + " · azar con más dinero " + pct(r.mejorAno) + " · azar con mejor peor-día " + pct(r.mejorPeor));
  console.log("  t de Welch (días parados contra días operados) = " + (isFinite(r.t) ? r.t.toFixed(2) : "—") + " · listón " + LISTON);
  const tt = tercios(r);
  console.log("  por tercios (signo + = en ese tercio parar habría ahorrado dinero): " + tt.map((x) => x.signo).join(""));
  for (const x of tt) console.log("     " + x.periodo + "  parados " + String(x.nOff).padStart(3) + "  media parados " + eur(x.mOff).padStart(10) + "  media operados " + eur(x.mOn).padStart(9));
}

writeFileSync("scripts/cola-parar-y-volver.json", JSON.stringify({
  base: BASE, rho, liston: LISTON, pruebas: PRUEBAS, sorteos: SORTEOS,
  reglas: R.map((r) => ({ fam: r.fam, nom: r.nom, ...r.m, t: r.t, domina: r.domina, mejorDD: r.mejorDD,
                          mejorAno: r.mejorAno, mejorPeor: r.mejorPeor, ddAhorrada: r.ddAhorrada,
                          anoCedido: r.anoCedido, efic: r.efic, eficAzar: r.eficAzar })),
  mejor: mejor ? { nom: mejor.nom, tercios: tercios(mejor) } : null,
}, null, 2), "utf8");
console.log("\n  detalle en scripts/cola-parar-y-volver.json");

// ═══ FAMILIA E · AÑADIDA DESPUÉS, Y SE DICE ══════════════════════════════════════════════════
// La auditoría dejó ver la identidad contable: pérdida al ser atravesado = ala×100 − crédito.
// El crédito se ve a las 11:00 al pedir la cotización, así que se puede filtrar por él SIN mirar
// al futuro, y ataca el tope de pérdida por el único lado que no es el ala.
// SON 5 PRUEBAS MÁS. El divisor pasa a 40 y se dice: no se esconde una prueba hecha.
const PRUEBAS2 = 40, LISTON2 = listonT(PRUEBAS2), LISTON_P2 = 0.05 / PRUEBAS2;
console.log("\n" + "═".repeat(120));
console.log("  FAMILIA E · no abrir si el crédito de las 11:00 es menor de $X  ·  divisor ahora " + PRUEBAS2 + " · listón de p = " + LISTON_P2.toFixed(4));
console.log("═".repeat(120) + "\n");
console.log("| regla | días parados | $/año | Δ$/año | PEOR DÍA | p1 | p5 | PEOR RACHA | Δcaída | t | p del azar | ¿aporta? |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const X of [100, 200, 300, 400, 500]) {
  const mask = filas.map((f) => f.credito >= X);
  const m = metricas(mask);
  const off = PL.filter((_, i) => !mask[i]), on = PL.filter((_, i) => mask[i]);
  const t = off.length >= 3 && on.length >= 3 ? tWelch(off, on) : NaN;
  const ctrl = m.para > 0 ? azar(m.para) : [];
  const dom = ctrl.length ? ctrl.filter((c) => c.dd <= m.dd && c.porAno >= m.porAno).length / ctrl.length : NaN;
  const aporta = m.para > 0 && dom < LISTON_P2 && BASE.dd - m.dd > 0;
  console.log("| crédito ≥ " + eur(X) + " | " + m.para + " | " + eur(m.porAno) + " | " + eur(m.porAno - BASE.porAno) +
    " | " + eur(m.peorDia) + " | " + eur(m.p1) + " | " + eur(m.p5) + " | " + eur(m.dd) + " | " + eur(BASE.dd - m.dd) +
    " | " + (isFinite(t) ? t.toFixed(2) : "—") + " | " + (isFinite(dom) ? pct(dom) : "—") + " | " + (aporta ? "🟢 **SÍ**" : "no") + " |");
}
