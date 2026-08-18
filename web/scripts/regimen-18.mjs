// ¿HAY UN "HOY NO" QUE VALGA? — las 18 pruebas de régimen sobre el cóndor 0DTE.
//
// ═══ LA LISTA SE CERRÓ ANTES DE CORRER ═══════════════════════════════════════════════════════
// Escrita y enseñada a Lester el 2026-08-17 ANTES de medir nada. El divisor del listón es 18 y
// NO SE BAJA aunque alguna prueba se quede sin correr por falta de dato: relajar la exigencia
// por un accidente de disponibilidad es manosear el experimento.
//
// FOMC y dato de inflación quedan DECLARADAS pero SIN CORRER: no tengo un calendario verificado
// de sus fechas y escribirlas de memoria sería inventar dato. Cuentan en el divisor igual.
//
// ═══ LA REGLA DE ORO DE ESTE FICHERO ═════════════════════════════════════════════════════════
// TODO se observa a las 11:00 ET o ANTES. El cierre del VIX de HOY son cinco horas de futuro
// (la suscripción es Index: FREE, sin intradía) — por eso los índices de volatilidad entran
// SIEMPRE con el cierre de AYER. Ver [thetadata-que-sirve-la-suscripcion] en memoria.
//
// ═══ QUÉ SE MIDE ═════════════════════════════════════════════════════════════════════════════
// Resultado = P&L en dólares del cóndor de 1 contrato ese día (±25 puntos, alas 50, entrada
// 11:00, bid al vender y ask al comprar, liquidado contra el cierre real de las 16:00).
// Para cada señal se parten los días en tercios y se compara el tercio alto contra el bajo.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { pasarBarrera, tWelch, listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const DIR = "scripts/cache-theta/gex-2026", VDIR = "scripts/cache-theta/vol-indices";
const HORA = "11:00", ALA = 50, SEP = 25, COMM = 0.03;
const PRUEBAS = 18;                        // DECLARADO DE ANTEMANO. No se toca.
const CACHE = "scripts/regimen-filas.json";

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

// ── FASE A · una pasada por los 653 días ────────────────────────────────────
function leerDia(fecha, right) {
  const f = DIR + "/iv_" + fecha + "_" + right + ".csv";
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "implied_vol", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iV, iU] = idx;

  const enHora = [], camino = new Map();
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0) camino.set(h, sp);                        // el spot de cada marca de 5 minutos
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]), iv = Number(c[iV]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, iv });
  }
  return enHora.length ? { filas: enHora, camino } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

let filas;
if (existsSync(CACHE)) {
  filas = JSON.parse(readFileSync(CACHE, "utf8"));
  console.log("## " + filas.length + " días leídos de caché");
} else {
  const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
  console.log("## FASE A · leyendo " + fechas.length + " días…");
  filas = [];
  for (let i = 0; i < fechas.length; i++) {
    const fecha = fechas[i];
    if (i % 100 === 0) console.log("   " + i + "/" + fechas.length + " · " + fecha);
    const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
    if (!C || !P) continue;
    const horas = [...C.camino.keys()].sort();
    const cierre = C.camino.get(horas[horas.length - 1]);
    const ap = C.camino.get(horas[0]);
    const sp11 = C.camino.get(HORA);
    if (!(cierre > 0) || !(ap > 0) || !(sp11 > 0)) continue;

    // el camino de la MAÑANA: de la apertura a las 11:00, ambas incluidas
    const manana = horas.filter((h) => h <= HORA).map((h) => C.camino.get(h)).filter((x) => x > 0);
    const maxM = Math.max(...manana), minM = Math.min(...manana);

    // el cóndor de ese día
    const cC = cerca(C.filas, sp11 + SEP), pC = cerca(P.filas, sp11 - SEP);
    const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
    if (cL.K <= cC.K || pL.K >= pC.K) continue;
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(cred > 0)) continue;
    const pl = (cred - Math.min(Math.max(cierre - cC.K, 0), cL.K - cC.K)
                     - Math.min(Math.max(pC.K - cierre, 0), pC.K - pL.K)) * 100 - 8 * COMM;

    // σ del RESTO de sesión con la IV del dinero a las 11:00 — todo observable al operar
    const atm = cerca(C.filas, sp11);
    const iv = atm.iv > 0 ? atm.iv : null;
    const sigma = iv ? sp11 * iv * Math.sqrt(5 / (252 * 6.5)) : null;

    filas.push({ fecha, pl, credito: cred * 100, cierre, ap, sp11, maxM, minM, sigma,
                 dow: new Date(fecha + "T00:00:00Z").getUTCDay(), dia: +fecha.slice(8, 10) });
  }
  writeFileSync(CACHE, JSON.stringify(filas), "utf8");
  console.log("   guardado: " + filas.length + " días");
}

// EL GUARDIÁN: un campo muerto se lee como 0 y se mide durante horas sin enterarse.
radiografia(filas, ["pl", "credito", "cierre", "ap", "sp11", "sigma"], "días del cóndor", { maxCeros: 0.2 });

// ── FASE B · las señales, todas observables a las 11:00 o antes ─────────────
const V = {};
for (const s of ["VIX", "VIX9D", "VIX3M", "VVIX"]) {
  const f = VDIR + "/" + s + ".json";
  if (existsSync(f)) V[s] = JSON.parse(readFileSync(f, "utf8"));
}
const clave = (f) => f.replace(/-/g, "");
// ÚLTIMO cierre ESTRICTAMENTE anterior. El de HOY sería futuro: liquida a las 16:00.
const anterior = (serie, fecha, n) => {
  const d = clave(fecha), ks = Object.keys(serie).filter((k) => k < d).sort();
  return ks.length >= n ? serie[ks[ks.length - n]] : null;
};

// cierres diarios de SPX construidos de los propios ficheros (no hay EOD de índice antes de 2024)
const cierres = {};
for (const f of filas) cierres[clave(f.fecha)] = f.cierre;
const clavesCierre = Object.keys(cierres).sort();

const terceroViernes = (f) => { const d = +f.slice(8, 10); return d >= 15 && d <= 21 && new Date(f + "T00:00:00Z").getUTCDay() === 5; };
const primerViernes = (f) => { const d = +f.slice(8, 10); return d <= 7 && new Date(f + "T00:00:00Z").getUTCDay() === 5; };

for (let i = 0; i < filas.length; i++) {
  const f = filas[i], ant = filas[i - 1];
  // ── GRUPO 1 · de la sesión, gratis y sin retraso ──
  f.sigmaRatio = f.sigma ? SEP / f.sigma : null;         // cuántas σ son nuestros 25 puntos fijos
  f.movManana = Math.abs(f.sp11 / f.ap - 1) * 100;
  f.extremo = (f.maxM > f.minM) ? Math.abs((f.sp11 - f.minM) / (f.maxM - f.minM) - 0.5) * 2 : null;
  f.hueco = ant ? Math.abs(f.ap / ant.cierre - 1) * 100 : null;
  f.rangoAyer = ant ? ((ant.maxM - ant.minM) / ant.cierre) * 100 : null;
  // ── GRUPO 2 · volatilidad, SIEMPRE con el cierre de AYER ──
  f.vix = V.VIX ? anterior(V.VIX, f.fecha, 1) : null;
  const vixA2 = V.VIX ? anterior(V.VIX, f.fecha, 2) : null;
  f.vixCambio = f.vix && vixA2 ? (f.vix / vixA2 - 1) * 100 : null;
  const v9 = V.VIX9D ? anterior(V.VIX9D, f.fecha, 1) : null;
  const v3m = V.VIX3M ? anterior(V.VIX3M, f.fecha, 1) : null;
  f.term9 = f.vix && v9 ? v9 / f.vix : null;             // >1 = estrés a corto plazo
  f.term3m = f.vix && v3m ? f.vix / v3m : null;          // >1 = curva invertida
  f.vvix = V.VVIX ? anterior(V.VVIX, f.fecha, 1) : null;
  // ── GRUPO 3 · calendario, publicado con años de antelación ──
  f.opex = terceroViernes(f.fecha) ? 1 : 0;
  f.empleo = primerViernes(f.fecha) ? 1 : 0;
  f.finMes = (!filas[i + 1] || filas[i + 1].fecha.slice(5, 7) !== f.fecha.slice(5, 7)) ? 1 : 0;
  // ── GRUPO 4 · tendencia ──
  const ks = clavesCierre.filter((k) => k < clave(f.fecha));
  const ult = (n) => ks.slice(-n).map((k) => cierres[k]);
  const m200 = ult(200); f.ma200 = m200.length === 200 ? (f.sp11 / media(m200) - 1) * 100 : null;
  const m60 = ult(60); f.distMax = m60.length === 60 ? (f.sp11 / Math.max(...m60) - 1) * 100 : null;
  let bajadas = 0;
  for (let k = ks.length - 1; k > 0 && bajadas < 10; k--) { if (cierres[ks[k]] < cierres[ks[k - 1]]) bajadas++; else break; }
  f.diasBajada = bajadas;
}

// ── FASE C · la criba ───────────────────────────────────────────────────────
const CONTINUAS = [
  ["G1", "sigmaRatio", "cuántas σ son los ±25 fijos (bajo = vendes casi en el dinero)"],
  ["G1", "movManana", "% que ya se movió de la apertura a las 11:00"],
  ["G1", "extremo", "qué tan al borde del rango de la mañana cierra las 11:00"],
  ["G1", "hueco", "% de hueco de apertura contra el cierre de ayer"],
  ["G1", "rangoAyer", "% de rango que hizo ayer"],
  ["G2", "vix", "VIX al cierre de AYER"],
  ["G2", "vixCambio", "% que cambió el VIX ayer"],
  ["G2", "term9", "VIX9D / VIX de ayer (>1 = estrés corto)"],
  ["G2", "term3m", "VIX / VIX3M de ayer (>1 = curva invertida)"],
  ["G2", "vvix", "VVIX al cierre de AYER"],
  ["G4", "ma200", "% de distancia a la media de 200 sesiones"],
  ["G4", "distMax", "% de distancia al máximo de 60 sesiones"],
  ["G4", "diasBajada", "días seguidos de caída antes de hoy"],
];
const BINARIAS = [
  ["G3", "opex", "vencimiento mensual (tercer viernes)"],
  ["G3", "empleo", "informe de empleo (primer viernes)"],
  ["G3", "finMes", "último día del mes"],
];

const liston = listonT(PRUEBAS);
console.log("\n" + "═".repeat(96));
console.log("  LAS " + PRUEBAS + " PRUEBAS DE RÉGIMEN · listón de |t| = " + liston + " (Bonferroni sobre " + PRUEBAS + ")");
console.log("  " + filas.length + " días · resultado = P&L del cóndor de 1 contrato");
console.log("═".repeat(96));

const resultados = [];
console.log("\n## CONTINUAS — tercio alto contra tercio bajo\n");
console.log("| grupo | señal | n | tercio ALTO | tercio BAJO | separación | t | signo por tercios | ¿pasa? |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const [g, campo, desc] of CONTINUAS) {
  const val = filas.filter((f) => f[campo] != null && isFinite(f[campo]));
  if (val.length < 200) { console.log("| " + g + " | `" + campo + "` | " + val.length + " | — | — | — | — | — | **sin muestra** |"); continue; }
  // ticker = MES: aquí el análogo de "un activo carga el hallazgo" es "un mes lo carga"
  const porFecha = new Map(val.map((f) => [f.fecha, f]));
  const fh = val.map((f) => ({ pnl: f.pl, ticker: f.fecha.slice(0, 7), fecha: f.fecha }));
  const v = pasarBarrera(fh, (x) => porFecha.get(x.fecha)[campo], { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
  const ord = [...val].sort((a, b) => b[campo] - a[campo]);
  const k = Math.floor(ord.length / 3);
  const alto = media(ord.slice(0, k).map((f) => f.pl)), bajo = media(ord.slice(-k).map((f) => f.pl));
  const signos = v.detalle.tercios.map((t) => (t.sep >= 0 ? "+" : "−")).join("");
  resultados.push({ g, campo, desc, t: v.detalle.t, pasa: v.pasa, sep: v.detalle.sep, alto, bajo, motivos: v.motivos });
  console.log("| " + g + " | `" + campo + "` | " + val.length + " | " + eur(alto) + " | " + eur(bajo) + " | " + eur(alto - bajo) +
              " | **" + (v.detalle.t || 0).toFixed(2) + "** | " + signos + " | " + (v.pasa ? "🟢 **SÍ**" : "no") + " |");
}

console.log("\n## BINARIAS — los días marcados contra el resto\n");
console.log("| grupo | señal | días | media MARCADOS | media resto | diferencia | t | ¿pasa? |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [g, campo, desc] of BINARIAS) {
  const si = filas.filter((f) => f[campo] === 1).map((f) => f.pl);
  const no = filas.filter((f) => f[campo] === 0).map((f) => f.pl);
  if (si.length < 10) { console.log("| " + g + " | `" + campo + "` | " + si.length + " | — | — | — | — | **sin muestra** |"); continue; }
  const t = tWelch(si, no);
  const pasa = Math.abs(t) >= liston && si.length >= 30;
  resultados.push({ g, campo, desc, t, pasa, sep: media(si) - media(no), alto: media(si), bajo: media(no),
                    motivos: pasa ? [] : ["binaria: muestra corta o |t| por debajo del listón"] });
  console.log("| " + g + " | `" + campo + "` | " + si.length + " | " + eur(media(si)) + " | " + eur(media(no)) +
              " | " + eur(media(si) - media(no)) + " | **" + t.toFixed(2) + "** | " + (pasa ? "🟢 **SÍ**" : "no") + " |");
}

console.log("\n## DÍA DE LA SEMANA\n");
console.log("| día | n | P&L medio |");
console.log("|---|---|---|");
for (const [d, nom] of [[1, "lunes"], [2, "martes"], [3, "miércoles"], [4, "jueves"], [5, "viernes"]]) {
  const g = filas.filter((f) => f.dow === d);
  if (g.length) console.log("| " + nom + " | " + g.length + " | " + eur(media(g.map((f) => f.pl))) + " |");
}

// ── VEREDICTO ───────────────────────────────────────────────────────────────
const pasan = resultados.filter((r) => r.pasa);
console.log("\n" + "═".repeat(96));
console.log("  VEREDICTO: " + pasan.length + " de " + resultados.length + " pruebas corridas pasan el listón de " + liston);
console.log("  (2 declaradas y NO corridas: FOMC y dato de inflación — sin calendario verificado)");
console.log("═".repeat(96));
if (!pasan.length) {
  const mejor = resultados.slice().sort((a, b) => Math.abs(b.t || 0) - Math.abs(a.t || 0))[0];
  console.log("\n  Ninguna. La más cercana: `" + mejor.campo + "` con |t| " + Math.abs(mejor.t || 0).toFixed(2) + " contra un listón de " + liston + ".");
  console.log("  " + mejor.desc);
  console.log("  Le falta: " + mejor.motivos.join(" · "));
  console.log("\n  CONCLUSIÓN OPERATIVA: no hay \"hoy no\". Se entra todos los días.");
} else {
  for (const r of pasan) {
    console.log("\n  🟢 " + r.campo + " — " + r.desc);
    console.log("     tercio alto " + eur(r.alto) + " contra tercio bajo " + eur(r.bajo) + " · separación " + eur(r.sep) + " · t " + (r.t || 0).toFixed(2));
    console.log("     ⚠️  ANTES DE OPERARLO: mandar a auditar, y comprobar cuánto de la separación viene del mes peor.");
  }
}
writeFileSync("scripts/regimen-18-resultado.json", JSON.stringify(resultados, null, 2), "utf8");
console.log("\n  detalle en scripts/regimen-18-resultado.json");
