// ═══ ESTRUCTURA 3 · FASE E — EL PUENTE: comprar la cola SÓLO CUANDO YA SE ESTÁ MOVIENDO ═══════
//
// Lo que dicen las fases A–D: una pata comprada a las 11:00 más allá del ala no puede cortar el
// peor día (la pérdida ya está topada en el ala) y su goteo diario empeora la caída. Pero eso es
// culpa de PAGARLA LOS 653 DÍAS. La cadena está en disco cada 5 minutos: se puede comprar la
// misma pata más tarde, y sólo el día que el precio ya va camino del ala.
//
// Esto NO es un stop: no cierra nada, no realiza la pérdida, no cambia el cóndor. Añade una pata
// larga cuando el movimiento ya es visible. Y todo es observable en el momento de comprar.
//
// PRUEBAS 25–30 (el divisor sube a 30; no se baja nunca):
//   25–27 · gatillo: el spot cae 30 / 40 / 50 puntos por debajo del de las 11:00 → comprar la put
//           al ASK de ESE momento, strike fijo en sp11−100
//   28–30 · lo mismo con el strike puesto 50 puntos por debajo del spot del disparo
//
// PRECIOS REALES: ASK del corte de 5 minutos en el que se dispara. Cero modelos, cero medios.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";

const DIR = "scripts/cache-theta/gex-2026", COMM = 0.03, PRUEBAS = 30;
const filas = JSON.parse(readFileSync("scripts/cola-filas.json", "utf8"));
const porFecha = new Map(filas.map((f) => [f.fecha, f]));
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const AÑOS = filas.length / 252;

// lector de la cadena de PUTS con TODOS los cortes de 5 minutos del día
function leerPutsCompleto(fecha) {
  const f = DIR + "/iv_" + fecha + "_P.csv";
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iU] = idx;
  const marcas = new Map();
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]), K = Number(c[iK]), ask = Number(c[iA]);
    if (!(K > 0)) continue;
    if (!marcas.has(h)) marcas.set(h, { spot: 0, filas: [] });
    const m = marcas.get(h);
    if (sp > 0) m.spot = sp;
    if (ask > 0) m.filas.push({ K, ask });
  }
  return marcas;
}
const cerca = (v, o) => v.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

// ── una pasada: para cada día, el primer corte en que el spot cae U puntos, y el ASK de allí ──
const CACHE = "scripts/cola-intradia.json";
let disparos;
if (existsSync(CACHE)) {
  disparos = JSON.parse(readFileSync(CACHE, "utf8"));
  console.log("## " + Object.keys(disparos).length + " días leídos de caché intradía");
} else {
  disparos = {};
  const fechas = filas.map((f) => f.fecha);
  for (let i = 0; i < fechas.length; i++) {
    const fecha = fechas[i];
    if (i % 50 === 0) console.log("   " + i + "/" + fechas.length + " · " + fecha);
    const f = porFecha.get(fecha), marcas = leerPutsCompleto(fecha);
    if (!marcas) continue;
    const horas = [...marcas.keys()].filter((h) => h > "11:00" && h <= "15:55").sort();
    const d = {};
    for (const U of [30, 40, 50]) {
      let hecho = null;
      for (const h of horas) {
        const m = marcas.get(h);
        if (!(m.spot > 0) || m.spot > f.sp11 - U || !m.filas.length) continue;
        const fijo = cerca(m.filas, f.sp11 - 100);          // el mismo strike de la fase B
        const movil = cerca(m.filas, m.spot - 50);          // 50 puntos por debajo del disparo
        hecho = { h, spot: m.spot, fijoK: fijo.K, fijoAsk: fijo.ask, movilK: movil.K, movilAsk: movil.ask };
        break;
      }
      d["u" + U] = hecho;
    }
    disparos[fecha] = d;
  }
  writeFileSync(CACHE, JSON.stringify(disparos), "utf8");
  console.log("   guardado en " + CACHE);
}

// ── medir ──
function met(pls) {
  let acum = 0, pico = 0, dd = 0;
  for (const p of pls) { acum += p; pico = Math.max(pico, acum); dd = Math.min(dd, acum - pico); }
  const s = [...pls].sort((a, b) => a - b);
  return { año: pls.reduce((a, b) => a + b, 0) / AÑOS, peor: s[0], p1: s[Math.floor(s.length * 0.01)],
    p5: s[Math.floor(s.length * 0.05)], dd, acierto: pls.filter((x) => x > 0).length / pls.length, pls };
}
const BASE = met(filas.map((f) => f.pl));

function variante(U, modo) {
  const pls = [], costes = [];
  let nDisp = 0, sinDato = 0;
  for (const f of filas) {
    const d = disparos[f.fecha]; let pl = f.pl;
    const g = d ? d["u" + U] : undefined;
    if (g === undefined) { sinDato++; }
    else if (g) {
      const K = modo === "fijo" ? g.fijoK : g.movilK, ask = modo === "fijo" ? g.fijoAsk : g.movilAsk;
      if (!(ask > 0)) { sinDato++; }                       // sin ASK real no se compra ni se inventa
      else { const coste = ask * 100 + COMM; pl += Math.max(K - f.cierre, 0) * 100 - coste; costes.push(coste); nDisp++; }
    }
    pls.push(pl);
  }
  const m = met(pls);
  return { ...m, nDisp, sinDato, costeAño: costes.reduce((a, b) => a + b, 0) / AÑOS };
}

const canje = (m, campo) => {
  const cortado = Math.abs(BASE[campo]) - Math.abs(m[campo]), perdido = BASE.año - m.año;
  return cortado > 0 ? perdido / cortado : null;
};
const linea = (nom, m, extra = "") => "| " + nom + " | " + extra + " | " + eur(m.año) + " | " + ((m.año / BASE.año - 1) * 100).toFixed(0)
  + "% | " + eur(m.peor) + " | " + eur(m.p1) + " | " + eur(m.p5) + " | " + eur(m.dd) + " | "
  + (canje(m, "peor") != null ? "$" + canje(m, "peor").toFixed(2) : "no corta") + " | "
  + (canje(m, "dd") != null ? "$" + canje(m, "dd").toFixed(2) : "no corta") + " |";

console.log("\n" + "═".repeat(126));
console.log("  25–30 · COMPRAR LA COLA CUANDO EL MOVIMIENTO YA HA EMPEZADO · listón |t| = " + listonT(PRUEBAS) + " (" + PRUEBAS + " pruebas)");
console.log("═".repeat(126) + "\n");
console.log("| estructura | días que dispara | $/año | vs base | peor día | p1 | p5 | caída máx | $/año por $1 de peor día | $/año por $1 de caída |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
console.log(linea("**cóndor solo (partida)**", BASE, "—"));
const R = {};
for (const modo of ["fijo", "movil"]) for (const U of [30, 40, 50]) {
  const m = variante(U, modo); R[modo + U] = m;
  console.log(linea("cae " + U + " pts → put " + (modo === "fijo" ? "en sp11−100" : "50 pts bajo el disparo"), m, m.nDisp + (m.sinDato ? " (" + m.sinDato + " sin dato)" : "")));
}

console.log("\n## los 8 peores días del cóndor, con el gatillo de −40 puntos (strike móvil)\n");
console.log("| fecha | mueve al cierre | cóndor solo | ¿disparó? | a qué hora | strike | ASK pagado | con la cola |");
console.log("|---|---|---|---|---|---|---|---|");
const idx = filas.map((f, i) => i).sort((a, b) => filas[a].pl - filas[b].pl).slice(0, 8);
for (const i of idx) {
  const f = filas[i], g = disparos[f.fecha] ? disparos[f.fecha].u40 : null;
  console.log("| " + f.fecha + " | " + (f.cierre - f.sp11).toFixed(0) + " pts | " + eur(f.pl) + " | " + (g ? "sí" : "no") + " | "
    + (g ? g.h : "—") + " | " + (g ? g.movilK : "—") + " | " + (g ? "$" + g.movilAsk.toFixed(2) : "—") + " | " + eur(R.movil40.pls[i]) + " |");
}

console.log("\n## estabilidad por tercios del peor día (el gatillo de −40, strike móvil)\n");
const k = Math.floor(filas.length / 3), rango = [[0, k], [k, 2 * k], [2 * k, filas.length]];
const bT = rango.map(([a, b]) => Math.min(...BASE.pls.slice(a, b)));
const mT = rango.map(([a, b]) => Math.min(...R.movil40.pls.slice(a, b)));
console.log("| tercio | cóndor solo | con la cola intradía | ¿corta? |");
console.log("|---|---|---|---|");
for (let i = 0; i < 3; i++) console.log("| T" + (i + 1) + " (" + filas[rango[i][0]].fecha + "→" + filas[rango[i][1] - 1].fecha + ") | " + eur(bT[i]) + " | " + eur(mT[i]) + " | " + (Math.abs(mT[i]) < Math.abs(bT[i]) ? "SÍ" : "no") + " |");
