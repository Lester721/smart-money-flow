// ═══ ESTRUCTURA 3 · COMPRAR LA COLA — FASE B: ¿el seguro compensa lo que cuesta? ═══════════════
//
// Lester NO quiere subir la media: quiere que el peor día y la peor racha duelan menos sin regalar
// los $18.770/año. Esto NO es un stop (los stops ya se midieron: pierden 29 de 30). Un stop
// interviene cuando ya duele; esto paga por adelantado y no interviene nunca.
//
// ═══ LA LISTA SE CIERRA ANTES DE CORRER (24 pruebas, el divisor NO se baja) ═══════════════════
//   1–4   put comprada a −75 / −100 / −150 / −200 puntos, todos los días
//   5–8   call comprada a +75 / +100 / +150 / +200, todos los días
//   9–12  las dos a la vez (cuna) a 75 / 100 / 150 / 200
//   13–18 la mejor put, sólo los días que un predictor marca: VIX de AYER alto · pocos σ ·
//         mañana movida · curva 9D invertida · ASK ≤ $0,50 · ASK ≤ $1,00
//   19–21 patrón de comparación: ala de 20 / 30 / 40 en vez de 50 (estrechar también corta la cola)
//   22–24 reserva declarada (ratio 1×2, cola sólo de un lado, tamaño)
//
// ═══ LO QUE NO SE NEGOCIA ════════════════════════════════════════════════════════════════════
//   · ASK real al comprar, BID real al vender. Cero modelos.
//   · Todo lo que decide la entrada se lee a las 11:00. El cierre sólo liquida.
//   · radiografia() sobre las filas ANTES de medir.

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

const COMM = 0.03, PRUEBAS = 24;
const LISTON = listonT(PRUEBAS);
const filas = JSON.parse(readFileSync("scripts/cola-filas.json", "utf8"));
const VDIR = "scripts/cache-theta/vol-indices";

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const AÑOS = filas.length / 252;

// ── índices de volatilidad: SIEMPRE el cierre de AYER (el de hoy son 5 horas de futuro) ──
const V = {};
for (const s of ["VIX", "VIX9D"]) { try { V[s] = JSON.parse(readFileSync(VDIR + "/" + s + ".json", "utf8")); } catch { V[s] = null; } }
const anterior = (serie, fecha) => {
  if (!serie) return null;
  const d = fecha.replace(/-/g, ""), ks = Object.keys(serie).filter((k) => k < d).sort();
  return ks.length ? serie[ks[ks.length - 1]] : null;
};
for (const f of filas) {
  f.vixAyer = anterior(V.VIX, f.fecha);
  const v9 = anterior(V.VIX9D, f.fecha);
  f.term9 = f.vixAyer && v9 ? v9 / f.vixAyer : null;
  f.sigmaRatio = f.sigma ? 25 / f.sigma : null;
  f.movManana = Math.abs(f.sp11 / f.ap - 1) * 100;
  f.askP100 = f.cola.p100.ask;
}

// ── EL GUARDIÁN: un campo muerto se lee como cero y se mide durante horas sin enterarse ──
radiografia(filas, ["pl", "credito", "sp11", "cierre", "sigma", "vixAyer", "askP100", "movManana"],
  "días del cóndor + cola", { maxCeros: 0.2 });
for (const d of [75, 100, 150, 200]) {
  const g = filas.map((f) => ({ askPut: f.cola["p" + d].ask, askCall: f.cola["c" + d].ask }));
  radiografia(g, ["askPut", "askCall"], "ASK de las patas a " + d + " puntos", { maxCeros: 0.05 });
}

// ── CONTROL: ¿reproduzco el cóndor de siempre? ──
const base = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const mapa = new Map(base.map((b) => [b.fecha, b.pl]));
let maxDif = 0, comunes = 0;
for (const f of filas) if (mapa.has(f.fecha)) { comunes++; maxDif = Math.max(maxDif, Math.abs(f.pl - mapa.get(f.fecha))); }
console.log("## CONTROL · " + comunes + " días cruzados con regimen-filas.json · diferencia máxima en el P&L: " + maxDif.toExponential(2));
if (maxDif > 0.01) throw new Error("NO reproduzco el cóndor base: la comparación no valdría nada");

// ══════════════════════════════════════════════════════════════════════════════════════════════
//  MÉTRICAS DE COLA
// ══════════════════════════════════════════════════════════════════════════════════════════════
function metricas(pls) {
  const total = pls.reduce((a, b) => a + b, 0);
  let acum = 0, pico = 0, dd = 0, curUW = 0, uw = 0;
  for (const p of pls) {
    acum += p; pico = Math.max(pico, acum); dd = Math.min(dd, acum - pico);   // caída pico→valle
    curUW = Math.min(0, curUW + p); uw = Math.min(uw, curUW);                 // racha desde cero
  }
  return { n: pls.length, total, año: total / AÑOS, mediaDia: media(pls),
    peor: Math.min(...pls), p1: pct(pls, 0.01), p5: pct(pls, 0.05),
    dd, racha: uw, acierto: pls.filter((x) => x > 0).length / pls.length };
}
const BASE = metricas(filas.map((f) => f.pl));

const pagoPut = (K, S) => Math.max(K - S, 0) * 100;
const pagoCall = (K, S) => Math.max(S - K, 0) * 100;

/** Aplica una cola. `cuando` = predicado observable a las 11:00 (null = todos los días). */
function conCola(d, lado, cuando = null) {
  const pls = [], compras = [], pagos = [];
  for (const f of filas) {
    let pl = f.pl;
    if (!cuando || cuando(f)) {
      let coste = 0, pago = 0;
      if (lado !== "call") { const p = f.cola["p" + d]; if (p.ask == null) return null; coste += p.ask * 100 + COMM; pago += pagoPut(p.K, f.cierre); }
      if (lado !== "put") { const c = f.cola["c" + d]; if (c.ask == null) return null; coste += c.ask * 100 + COMM; pago += pagoCall(c.K, f.cierre); }
      pl += pago - coste;
      compras.push(coste); pagos.push(pago);
    }
    pls.push(pl);
  }
  const m = metricas(pls);
  const dif = pls.map((p, i) => p - filas[i].pl);
  const t = sd(dif) > 0 ? media(dif) / (sd(dif) / Math.sqrt(dif.length)) : 0;
  return { ...m, pls, dif, t, nCompras: compras.length, costeAño: compras.reduce((a, b) => a + b, 0) / AÑOS,
    pagoAño: pagos.reduce((a, b) => a + b, 0) / AÑOS, diasQuePaga: pagos.filter((x) => x > 0).length };
}

/** El cóndor con otro ancho de ala (patrón de comparación). */
function conAla(w) {
  const pls = [];
  for (const f of filas) {
    const a = f.alas["a" + w]; if (!a) return null;
    const cred = f.cCbid + f.pCbid - a.cAsk - a.pAsk;
    if (!(cred > 0)) { pls.push(-8 * COMM); continue; }
    pls.push((cred - Math.min(Math.max(f.cierre - f.cCK, 0), a.cK - f.cCK)
                   - Math.min(Math.max(f.pCK - f.cierre, 0), f.pCK - a.pK)) * 100 - 8 * COMM);
  }
  return metricas(pls);
}

/** Canje: cuántos $/año se sacrifican por cada $1 de caída eliminado. Menos es mejor. */
const canje = (m, campo) => {
  const cortado = Math.abs(BASE[campo]) - Math.abs(m[campo]);
  const perdido = BASE.año - m.año;
  return { cortado, perdido, ratio: cortado > 0 ? perdido / cortado : null };
};
const fila = (nom, m) => {
  const cPeor = canje(m, "peor"), cDD = canje(m, "dd");
  return "| " + nom + " | " + eur(m.año) + " | " + ((m.año / BASE.año - 1) * 100).toFixed(0) + "% | " + eur(m.peor)
    + " | " + eur(m.p1) + " | " + eur(m.p5) + " | " + eur(m.dd) + " | " + (m.acierto * 100).toFixed(0) + "% | "
    + (cPeor.cortado > 0 ? "$" + cPeor.ratio.toFixed(2) : "—") + " | " + (cDD.cortado > 0 ? "$" + cDD.ratio.toFixed(2) : "—") + " |";
};

console.log("\n" + "═".repeat(126));
console.log("  COMPRAR LA COLA · " + filas.length + " días (" + filas[0].fecha + " → " + filas[filas.length - 1].fecha + ") · " + PRUEBAS + " pruebas declaradas · listón |t| = " + LISTON);
console.log("  PARTIDA: " + eur(BASE.año) + "/año · peor día " + eur(BASE.peor) + " · p1 " + eur(BASE.p1) + " · p5 " + eur(BASE.p5) + " · caída pico→valle " + eur(BASE.dd) + " · racha desde cero " + eur(BASE.racha) + " · acierto " + (BASE.acierto * 100).toFixed(0) + "%");
console.log("═".repeat(126));

console.log("\n## 1–12 · COMPRAR LA COLA TODOS LOS DÍAS\n");
const CAB = "| estructura | $/año | vs base | peor día | p1 | p5 | caída máx | acierto | $/año por $1 de peor día | $/año por $1 de caída |";
console.log(CAB); console.log("|---|---|---|---|---|---|---|---|---|---|");
console.log(fila("**cóndor solo (partida)**", BASE));
const G = {};
for (const lado of ["put", "call", "ambas"]) for (const d of [75, 100, 150, 200]) {
  const m = conCola(d, lado); if (!m) { console.log("| " + lado + " " + d + " | SIN ASK ALGÚN DÍA — no se puede comprar |"); continue; }
  G[lado + d] = m; console.log(fila(lado + " a " + d + " pts", m));
}

console.log("\n## lo que cuesta y lo que paga cada pata, en bruto\n");
console.log("| pata | coste/año | pago/año | neto/año | días que paga algo | t del neto diario (listón " + LISTON + ") |");
console.log("|---|---|---|---|---|---|");
for (const lado of ["put", "call", "ambas"]) for (const d of [75, 100, 150, 200]) {
  const m = G[lado + d]; if (!m) continue;
  console.log("| " + lado + " " + d + " | " + eur(-m.costeAño) + " | " + eur(m.pagoAño) + " | " + eur(m.pagoAño - m.costeAño) + " | " + m.diasQuePaga + " de " + m.n + " | " + m.t.toFixed(2) + " |");
}

// ── ¿el ala y la cola a 75 son el MISMO strike? Hay que decirlo, no esconderlo ──
const iguales = filas.filter((f) => f.cola.p75.K === f.pLK).length;
console.log("\n  NOTA: en " + iguales + " de " + filas.length + " días el strike de la 'cola a 75' es EXACTAMENTE el ala larga de la put.");
console.log("  Comprar ahí no es añadir cola: es doblar el ala (ratio 1×2). Se reporta como tal.");

// ══════════════════════════════════════════════════════════════════════════════════════════════
//  13–18 · COMPRAR LA COLA SÓLO LOS DÍAS "PELIGROSOS"
// ══════════════════════════════════════════════════════════════════════════════════════════════
const terc = (campo, alto) => {
  const v = filas.map((f) => f[campo]).filter((x) => x != null && isFinite(x)).sort((a, b) => a - b);
  return v[Math.floor(v.length * (alto ? 2 / 3 : 1 / 3))];
};
const uVix = terc("vixAyer", true), uSig = terc("sigmaRatio", false), uMov = terc("movManana", true);
const GATILLOS = [
  ["VIX de AYER en el tercio alto (≥ " + uVix.toFixed(1) + ")", (f) => f.vixAyer != null && f.vixAyer >= uVix],
  ["los ±25 pts son POCOS σ (ratio ≤ " + uSig.toFixed(2) + ")", (f) => f.sigmaRatio != null && f.sigmaRatio <= uSig],
  ["mañana ya movida (≥ " + uMov.toFixed(2) + "%)", (f) => f.movManana >= uMov],
  ["curva 9D invertida (VIX9D/VIX > 1)", (f) => f.term9 != null && f.term9 > 1],
  ["la put cuesta ≤ $0,50", (f) => f.cola.p100.ask != null && f.cola.p100.ask <= 0.5],
  ["la put cuesta ≤ $1,00", (f) => f.cola.p100.ask != null && f.cola.p100.ask <= 1.0],
];
console.log("\n## 13–18 · LA PUT A 100 PUNTOS, SÓLO LOS DÍAS QUE ALGO LA MARCA\n");
console.log("| gatillo (observable a las 11:00) | días | $/año | peor día | p1 | caída máx | $/año por $1 de peor día |");
console.log("|---|---|---|---|---|---|---|");
for (const [nom, pred] of GATILLOS) {
  const m = conCola(100, "put", pred); if (!m) continue;
  const c = canje(m, "peor");
  console.log("| " + nom + " | " + m.nCompras + " | " + eur(m.año) + " | " + eur(m.peor) + " | " + eur(m.p1) + " | " + eur(m.dd) + " | " + (c.cortado > 0 ? "$" + c.ratio.toFixed(2) : "no corta nada") + " |");
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
//  19–21 · PATRÓN DE COMPARACIÓN: ESTRECHAR EL ALA
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n## 19–21 · PATRÓN DE COMPARACIÓN — estrechar el ala en vez de comprar cola\n");
console.log(CAB); console.log("|---|---|---|---|---|---|---|---|---|---|");
console.log(fila("**ala 50 (partida)**", BASE));
for (const w of [40, 30, 20]) { const m = conAla(w); if (m) console.log(fila("ala " + w, m)); }

// ══════════════════════════════════════════════════════════════════════════════════════════════
//  ¿DE DÓNDE SALE EL PEOR DÍA? — sin esto no se sabe qué se está intentando cubrir
// ══════════════════════════════════════════════════════════════════════════════════════════════
const peores = [...filas].sort((a, b) => a.pl - b.pl).slice(0, 12);
console.log("\n## los 12 peores días del cóndor · qué lado rompió y qué habría pagado la cola\n");
console.log("| fecha | mov. del día | P&L cóndor | lado | put −100 paga | call +100 paga | put −150 | put −200 |");
console.log("|---|---|---|---|---|---|---|---|");
for (const f of peores) {
  const mv = (f.cierre / f.sp11 - 1) * 100;
  console.log("| " + f.fecha + " | " + mv.toFixed(2) + "% | " + eur(f.pl) + " | " + (f.cierre < f.pCK ? "PUT" : f.cierre > f.cCK ? "CALL" : "—")
    + " | " + eur(pagoPut(f.cola.p100.K, f.cierre) - f.cola.p100.ask * 100) + " | " + eur(pagoCall(f.cola.c100.K, f.cierre) - f.cola.c100.ask * 100)
    + " | " + eur(pagoPut(f.cola.p150.K, f.cierre) - f.cola.p150.ask * 100) + " | " + eur(pagoPut(f.cola.p200.K, f.cierre) - f.cola.p200.ask * 100) + " |");
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
//  ESTABILIDAD EN LOS TRES TERCIOS — el recorte de cola no puede vivir en un solo período
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n## el recorte del peor día, tercio a tercio (si vive en uno solo, no es una propiedad, es una anécdota)\n");
console.log("| estructura | T1 peor día | T2 peor día | T3 peor día | signo por tercios |");
console.log("|---|---|---|---|---|");
const k = Math.floor(filas.length / 3);
const rango = [[0, k], [k, 2 * k], [2 * k, filas.length]];
const basePeorT = rango.map(([a, b]) => Math.min(...filas.slice(a, b).map((f) => f.pl)));
console.log("| **cóndor solo** | " + basePeorT.map(eur).join(" | ") + " | — |");
for (const nom of ["put100", "put150", "put200", "ambas100"]) {
  const m = G[nom]; if (!m) continue;
  const pt = rango.map(([a, b]) => Math.min(...m.pls.slice(a, b)));
  const signos = pt.map((x, i) => (Math.abs(x) < Math.abs(basePeorT[i]) ? "+" : "−")).join("");
  console.log("| " + nom + " | " + pt.map(eur).join(" | ") + " | " + signos + " |");
}

console.log("\n## potencia: ¿de cuántos días depende el recorte?\n");
for (const nom of ["put100", "put150", "put200"]) {
  const m = G[nom]; if (!m) continue;
  const netos = m.dif.map((x, i) => ({ x, f: filas[i].fecha })).sort((a, b) => b.x - a.x).slice(0, 3);
  console.log("  " + nom + ": los 3 días que más pagan son " + netos.map((z) => z.f + " " + eur(z.x)).join(" · ")
    + " — suman " + eur(netos.reduce((a, z) => a + z.x, 0)) + " de un coste total de " + eur(-m.costeAño * AÑOS));
}
