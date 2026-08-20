// FASE C · ¿HABÍA UN AVISO A TIEMPO? — el interruptor de régimen, con el cruce obligatorio.
//
// ═══ LA SEÑAL ════════════════════════════════════════════════════════════════════════════════
// R_N(D) = Σ crédito / Σ movimiento realizado, sobre los N días ANTERIORES a D.
//   · crédito    = puntos de SPX que paga el cóndor ±25/alas 50 a las 11:00 (bid al vender,
//                  ask al comprar; precio real, nunca de modelo)
//   · movimiento = |cierre − spot 11:00| de ese día, en puntos
// R bajo = el mercado está pagando poco por el riesgo que entrega. La hipótesis del encargo es
// que R bajo debería APAGAR la estrategia.
// TODO son días CERRADOS: a las 11:00 de D, R_N(D) ya se sabe entero. Nada de futuro.
//
// ═══ CUÁNTAS PRUEBAS ═════════════════════════════════════════════════════════════════════════
// 3 ventanas (20/40/60) × 5 umbrales (percentil 10/20/30/40/50 de la muestra de ajuste) = 15
// combinaciones, evaluadas de TRES formas: A→B, B→A y caminando hacia delante. Son 45.
// Más 3 controles (el mismo esquema con el P&L pasado en vez de R). DECLARADO: 48. No se baja.
//
// ═══ CÓMO SE ELIGE ═══════════════════════════════════════════════════════════════════════════
// POR RIESGO, nunca por $/año (ρ del ingreso entre períodos = −0,66; la del riesgo = +0,98).
// Criterio de ajuste: de las 15, la que deja la MEDIA DEL 5% PEOR menos negativa entre las que
// conservan al menos la mitad de los días. El ingreso que salga, sale.

import { readFileSync } from "node:fs";
import { listonT, tWelch } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const CUENTA = 56389;
const PRUEBAS = 48;
const LISTON = listonT(PRUEBAS);
const VENTANAS = [20, 40, 60];
const CUANTILES = [0.10, 0.20, 0.30, 0.40, 0.50];
const MIN_HIST = 250; // días de historia antes de que exista el umbral caminante

const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const cvar = (v, p = 0.05) => { const s = [...v].sort((a, b) => a - b); return media(s.slice(0, Math.max(1, Math.floor(v.length * p)))); };
const cuantil = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]; };
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
const pc = (x) => (x * 100).toFixed(1) + "%";
/** Caída máxima en $ de la curva acumulada, en orden cronológico. */
function caida(fs, activo) {
  let acum = 0, techo = 0, peor = 0;
  for (const f of fs) { acum += activo(f) ? f.pl : 0; techo = Math.max(techo, acum); peor = Math.min(peor, acum - techo); }
  return -peor;
}

const filas = JSON.parse(readFileSync("scripts/aviso2023-filas.json", "utf8"));
for (const N of VENTANAS) {
  for (let i = 0; i < filas.length; i++) {
    if (i < N) { filas[i]["R" + N] = null; filas[i]["P" + N] = null; continue; }
    const v = filas.slice(i - N, i);
    filas[i]["R" + N] = suma(v.map((f) => f.credito)) / suma(v.map((f) => f.mov));
    filas[i]["P" + N] = media(v.map((f) => f.pl)); // CONTROL: el P&L de los N días previos
  }
}
radiografia(filas.slice(60), ["R20", "R40", "R60", "P20", "P40", "P60", "pl"], "señal de régimen", { maxCeros: 0.05 });

const A = filas.filter((f) => f.fecha < "2024-01-01");  // 2022-2023
const B = filas.filter((f) => f.fecha >= "2024-01-01"); // 2024-2026
console.log("\n## MITADES · A = 2022-2023 (" + A.length + " días) · B = 2024-2026 (" + B.length + " días)");
console.log("## LISTÓN de |t| = " + LISTON + " (Bonferroni sobre " + PRUEBAS + " pruebas declaradas)");

// ─── 1 · EL CRUCE: ajustar el umbral en una mitad, aplicarlo TAL CUAL a la otra ───────────────
function evaluar(dias, campo, umbral) {
  const con = dias.filter((f) => f[campo] != null);
  const on = con.filter((f) => f[campo] >= umbral), off = con.filter((f) => f[campo] < umbral);
  if (on.length < 30 || off.length < 30) return null;
  const plsOn = on.map((f) => f.pl);
  return {
    n: con.length, nOn: on.length, pctOff: off.length / con.length,
    dolAno: suma(plsOn) / (con.length / 252), cvar: cvar(plsOn), peor: Math.min(...plsOn),
    caida: caida(con, (f) => f[campo] >= umbral), caidaSin: caida(con, () => true),
    dolAnoSin: suma(con.map((f) => f.pl)) / (con.length / 252),
    cvarSin: cvar(con.map((f) => f.pl)),
    t: tWelch(plsOn, off.map((f) => f.pl)), mOn: media(plsOn), mOff: media(off.map((f) => f.pl)),
  };
}

const filasCruce = [];
for (const [nombre, ajuste, prueba] of [["A→B", A, B], ["B→A", B, A]]) {
  console.log("\n### AJUSTE en " + nombre.slice(0, 1) + " → PRUEBA en " + nombre.slice(-1) + "\n");
  console.log("| ventana | percentil | umbral R | AJUSTE: %off · 5% peor | PRUEBA: %off | $/año | 5% peor | caída máx | t (on vs off) |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const N of VENTANAS) {
    for (const q of CUANTILES) {
      const campo = "R" + N;
      const u = cuantil(ajuste.map((f) => f[campo]).filter((x) => x != null), q);
      const ea = evaluar(ajuste, campo, u), ep = evaluar(prueba, campo, u);
      if (!ea || !ep) { console.log("| " + N + " | p" + q * 100 + " | " + u.toFixed(3) + " | — | — | — | — | — | **sin muestra** |"); continue; }
      filasCruce.push({ dir: nombre, N, q, u, ea, ep });
      console.log("| " + N + " | p" + q * 100 + " | " + u.toFixed(3) + " | " + pc(ea.pctOff) + " · " + eur(ea.cvar) +
        " | " + pc(ep.pctOff) + " | " + eur(ep.dolAno) + " | " + eur(ep.cvar) + " | " + eur(ep.caida) + " | " + ep.t.toFixed(2) + " |");
    }
  }
  const cand = filasCruce.filter((r) => r.dir === nombre && r.ea.pctOff <= 0.5).sort((x, y) => y.ea.cvar - x.ea.cvar);
  const g = cand[0];
  console.log("\n**Elegida POR RIESGO en la mitad de ajuste: ventana " + g.N + ", percentil " + g.q * 100 + " (umbral R = " + g.u.toFixed(3) + ").**");
  console.log("Fuera de muestra: apaga el " + pc(g.ep.pctOff) + " de los días · $/año " + eur(g.ep.dolAno) + " (sin filtro " + eur(g.ep.dolAnoSin) + ") · " +
    "5% peor " + eur(g.ep.cvar) + " (sin filtro " + eur(g.ep.cvarSin) + ") · caída " + eur(g.ep.caida) + " (sin filtro " + eur(g.ep.caidaSin) + ") · " +
    "t = " + g.ep.t.toFixed(2) + " contra un listón de " + LISTON);
  console.log("Media del día operado " + eur(g.ep.mOn) + " vs del día apagado " + eur(g.ep.mOff) + ". " +
    (g.ep.mOff < g.ep.mOn ? "El signo va en la dirección de la hipótesis." : "**El signo va AL REVÉS: los días que apagaría fueron los MEJORES.**"));
}

// ─── 2 · LA VERSIÓN OPERABLE: umbral caminando hacia delante ──────────────────────────────────
console.log("\n\n" + "═".repeat(118));
console.log("  2 · CAMINANDO HACIA DELANTE · el umbral de cada día es el percentil q de TODOS los días anteriores");
console.log("═".repeat(118));
console.log("| ventana | percentil | n con señal | % días off | $/año | 5% peor | caída máx | t (on vs off) | off en 2023 | off en 2025 |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const wf = [];
for (const N of VENTANAS) {
  for (const q of CUANTILES) {
    const campo = "R" + N, hist = [], marcadas = [];
    for (const f of filas) {
      const v = f[campo];
      if (v == null) continue;
      if (hist.length >= MIN_HIST) marcadas.push({ ...f, on: v >= cuantil(hist, q) });
      hist.push(v);
    }
    if (marcadas.length < 200) { console.log("| " + N + " | p" + q * 100 + " | " + marcadas.length + " | — | — | — | — | — | — | **sin muestra** |"); continue; }
    const on = marcadas.filter((f) => f.on), off = marcadas.filter((f) => !f.on);
    const t = tWelch(on.map((f) => f.pl), off.map((f) => f.pl));
    const dolAno = suma(on.map((f) => f.pl)) / (marcadas.length / 252);
    const offAno = (a) => { const g = marcadas.filter((f) => f.fecha.startsWith(a)); return g.length ? pc(g.filter((f) => !f.on).length / g.length) : "—"; };
    const r = { N, q, marcadas, on, off, t, dolAno, cvar: cvar(on.map((f) => f.pl)), caida: caida(marcadas, (f) => f.on), pctOff: off.length / marcadas.length };
    wf.push(r);
    console.log("| " + N + " | p" + q * 100 + " | " + marcadas.length + " | " + pc(r.pctOff) + " | " + eur(dolAno) + " | " + eur(r.cvar) +
      " | " + eur(r.caida) + " | " + t.toFixed(2) + " | " + offAno("2023") + " | " + offAno("2025") + " |");
  }
}

// ─── 3 · CONTROL — la misma regla con el P&L de los N días previos ────────────────────────────
console.log("\n## CONTROL · la misma regla pero con el P&L medio de los N días previos (3 pruebas)\n");
console.log("| ventana | percentil | n | % días off | $/año | 5% peor | caída máx | t | off 2023 | off 2025 |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const N of VENTANAS) {
  const q = 0.30, campo = "P" + N, hist = [], marcadas = [];
  for (const f of filas) {
    const v = f[campo]; if (v == null) continue;
    if (hist.length >= MIN_HIST) marcadas.push({ ...f, on: v >= cuantil(hist, q) });
    hist.push(v);
  }
  const on = marcadas.filter((f) => f.on), off = marcadas.filter((f) => !f.on);
  const offAno = (a) => { const g = marcadas.filter((f) => f.fecha.startsWith(a)); return g.length ? pc(g.filter((f) => !f.on).length / g.length) : "—"; };
  console.log("| " + N + " | p30 | " + marcadas.length + " | " + pc(off.length / marcadas.length) + " | " + eur(suma(on.map((f) => f.pl)) / (marcadas.length / 252)) +
    " | " + eur(cvar(on.map((f) => f.pl))) + " | " + eur(caida(marcadas, (f) => f.on)) + " | " + tWelch(on.map((f) => f.pl), off.map((f) => f.pl)).toFixed(2) +
    " | " + offAno("2023") + " | " + offAno("2025") + " |");
}

// ─── 4 · AÑO A AÑO de la mejor caminante POR RIESGO ───────────────────────────────────────────
const mejor = [...wf].filter((r) => r.pctOff <= 0.5).sort((x, y) => y.cvar - x.cvar)[0];
console.log("\n\n## AÑO A AÑO · la caminante elegida POR RIESGO: ventana " + mejor.N + ", percentil " + mejor.q * 100 + "\n");
console.log("| año | días | % apagados | $ sin filtro | $ con filtro | diferencia |");
console.log("|---|---|---|---|---|---|");
for (const a of ["2022", "2023", "2024", "2025", "2026"]) {
  const g = mejor.marcadas.filter((f) => f.fecha.startsWith(a));
  if (!g.length) { console.log("| " + a + " | 0 | — | — | — | sin señal (hace falta historia) |"); continue; }
  const sin = suma(g.map((f) => f.pl)), con = suma(g.filter((f) => f.on).map((f) => f.pl));
  console.log("| " + a + " | " + g.length + " | " + pc(g.filter((f) => !f.on).length / g.length) + " | " + eur(sin) + " | " + eur(con) + " | " + eur(con - sin) + " |");
}
const todos = mejor.marcadas, totalSin = suma(todos.map((f) => f.pl));
console.log("\nSobre los " + todos.length + " días con señal: sin filtro " + eur(totalSin) + " en total, con filtro " + eur(suma(mejor.on.map((f) => f.pl))) + ".");
console.log("En $/año sobre la cuenta de " + eur(CUENTA) + ": sin filtro " + eur(totalSin / (todos.length / 252)) + " (" + pc(totalSin / (todos.length / 252) / CUENTA) + "), " +
  "con filtro " + eur(mejor.dolAno) + " (" + pc(mejor.dolAno / CUENTA) + ") — 1 contrato.");
console.log("Caída máxima: sin filtro " + eur(caida(todos, () => true)) + " (" + pc(caida(todos, () => true) / CUENTA) + " de la cuenta), " +
  "con filtro " + eur(mejor.caida) + " (" + pc(mejor.caida / CUENTA) + ").");
console.log("Peor día: sin filtro " + eur(Math.min(...todos.map((f) => f.pl))) + ", con filtro " + eur(Math.min(...mejor.on.map((f) => f.pl))) + ".");
console.log("t de los días operados contra los apagados: " + mejor.t.toFixed(2) + " · listón " + LISTON + " → " + (Math.abs(mejor.t) >= LISTON ? "PASA" : "NO PASA"));
