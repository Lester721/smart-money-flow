// EL STOP CONDICIONAL — la unica palanca que puede bajar el PEOR DIA por debajo del ancho del ala.
//
// ═══ POR QUE ESTE Y NO OTRO ═══════════════════════════════════════════════════════════════════
// scripts/anatomia3-salir-antes.mjs ya midio salir a una HORA FIJA: catastrofico. Salir a las
// 15:00 todos los dias da −$9.647/ano contra +$18.696 de aguantar, porque se paga la horquilla
// entera las 653 veces.
//
// Un stop CONDICIONAL es otra cosa: solo paga la horquilla los dias que se dispara. Si salta el
// 12% de los dias, la horquilla se paga 78 veces y no 653. Nadie lo ha medido.
//
// ═══ COMO SE MIDE ════════════════════════════════════════════════════════════════════════════
// Cada 5 minutos, de 11:05 a 15:55, se calcula lo que costaria CERRAR el condor de verdad:
// recomprar las vendidas al ASK y vender las compradas al BID — la horquilla entera otra vez.
// Si esa perdida llega a X veces el credito cobrado, se cierra ahi y se acabo el dia.
// Comisiones: 8 patas al entrar + 8 al salir cuando se sale; 8 solas si se aguanta a vencimiento.
// Si el stop no salta, se liquida contra el cierre real de las 16:00, igual que la base.
//
// NADA DE FUTURO: el disparo usa la cotizacion de ESE minuto, no la del cierre.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { metricas, eur, media, pct } from "./cola-lib.mjs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", ALA = 50, SEP = 25, COMM = 0.03;
const MULT = [1, 2, 3, 4];          // el stop salta cuando la perdida llega a X veces el credito

/** Devuelve Map<hora, Map<strike,{bid,ask}>> + el camino del subyacente. */
function leerDia(fecha, right) {
  const f = DIR + "/iv_" + fecha + "_" + right + ".csv";
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iU] = idx;
  const porHora = new Map(), camino = new Map();
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0) camino.set(h, sp);
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (!(K > 0) || !(bid >= 0) || !(ask > 0)) continue;
    if (!porHora.has(h)) porHora.set(h, new Map());
    porHora.get(h).set(K, { bid, ask });
  }
  return porHora.size ? { porHora, camino } : null;
}
const cercaK = (m, o) => { let mejor = null; for (const K of m.keys()) if (mejor === null || Math.abs(K - o) < Math.abs(mejor - o)) mejor = K; return mejor; };

const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
console.log("## " + fechas.length + " dias · stop conditional cada 5 min de 11:05 a 15:55\n");

const D = [];
let sinCotiz = 0;
for (let i = 0; i < fechas.length; i++) {
  const fecha = fechas[i];
  if (i % 150 === 0) console.log("   " + i + "/" + fechas.length + " · " + fecha);
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) continue;
  const horas = [...C.camino.keys()].sort();
  const cierre = C.camino.get(horas[horas.length - 1]), sp11 = C.camino.get(HORA);
  if (!(cierre > 0) || !(sp11 > 0)) continue;
  const cH = C.porHora.get(HORA), pH = P.porHora.get(HORA);
  if (!cH || !pH) continue;
  const kCC = cercaK(cH, sp11 + SEP), kPC = cercaK(pH, sp11 - SEP);
  const kCL = cercaK(cH, kCC + ALA), kPL = cercaK(pH, kPC - ALA);
  if (!(kCL > kCC) || !(kPL < kPC)) continue;
  const cred = cH.get(kCC).bid + pH.get(kPC).bid - cH.get(kCL).ask - pH.get(kPL).ask;
  if (!(cred > 0)) continue;

  const plVenc = (cred - Math.min(Math.max(cierre - kCC, 0), kCL - kCC)
                       - Math.min(Math.max(kPC - cierre, 0), kPC - kPL)) * 100 - 8 * COMM;
  const fila = { fecha, cred: cred * 100, plVenc, cierre, sp11 };

  // el camino del coste de cerrar, minuto a minuto
  const marcas = [...C.porHora.keys()].filter((h) => h > HORA && h <= "15:55").sort();
  const coste = [];
  for (const h of marcas) {
    const c = C.porHora.get(h), p = P.porHora.get(h);
    if (!c || !p) continue;
    const a = c.get(kCC), b = p.get(kPC), x = c.get(kCL), y = p.get(kPL);
    if (!a || !b || !x || !y) continue;
    // cerrar = recomprar las vendidas al ASK, vender las compradas al BID
    coste.push({ h, c: a.ask + b.ask - x.bid - y.bid });
  }
  if (!coste.length) { sinCotiz++; continue; }
  fila.coste = coste;
  for (const X of MULT) {
    const umbral = cred * (1 + X);          // coste de cerrar al que la perdida = X veces el credito
    const disparo = coste.find((z) => z.c >= umbral);
    fila["stop" + X] = disparo ? (cred - disparo.c) * 100 - 16 * COMM : plVenc;
    fila["salto" + X] = disparo ? 1 : 0;
    fila["hora" + X] = disparo ? disparo.h : null;
  }
  D.push(fila);
}
console.log("\n   dias medidos: " + D.length + " · sin cotizacion intradia de las 4 patas: " + sinCotiz);
radiografia(D, ["cred", "plVenc", ...MULT.map((X) => "stop" + X)], "stop condicional", { maxCeros: 0.2 });

const N = D.length;
const B = metricas(D.map((d) => d.plVenc), N);
console.log("\n## RESULTADO · " + N + " dias · aguantar a vencimiento contra el stop\n");
console.log("| regla | % dias que salta | $/ano | media/op | acierto | peor dia | p1 | p5 | caida | ingreso/caida |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
console.log("| AGUANTAR (la de hoy) | 0% | " + eur(B.anual) + " | " + eur(B.media) + " | " + (B.acierto * 100).toFixed(1) +
            "% | " + eur(B.peor) + " | " + eur(B.p1) + " | " + eur(B.p5) + " | " + eur(B.dd) + " | **" + (B.anual / B.dd).toFixed(2) + "** |");
const R = {};
for (const X of MULT) {
  const m = metricas(D.map((d) => d["stop" + X]), N);
  R[X] = m;
  const salta = D.reduce((a, d) => a + d["salto" + X], 0);
  console.log("| stop a " + X + "x el credito | " + (salta / N * 100).toFixed(1) + "% | " + eur(m.anual) + " | " + eur(m.media) +
              " | " + (m.acierto * 100).toFixed(1) + "% | " + eur(m.peor) + " | " + eur(m.p1) + " | " + eur(m.p5) +
              " | " + eur(m.dd) + " | **" + (m.anual / m.dd).toFixed(2) + "**" + (m.anual / m.dd > B.anual / B.dd ? " OK" : "") + " |");
}

console.log("\n## A IGUAL INGRESO — contratos para igualar " + eur(B.anual) + "/ano\n");
console.log("| regla | contratos | colateral | peor dia | p1 | p5 | caida | caida quitada |");
console.log("|---|---|---|---|---|---|---|---|");
for (const X of MULT) {
  const m = R[X]; if (m.anual <= 0) { console.log("| stop a " + X + "x | pierde dinero | | | | | | |"); continue; }
  const k = B.anual / m.anual;
  console.log("| stop a " + X + "x | " + k.toFixed(2) + " | " + eur(k * 5000) + " | " + eur(m.peor * k) + " | " + eur(m.p1 * k) +
              " | " + eur(m.p5 * k) + " | " + eur(m.dd * k) + " | " + eur(B.dd - m.dd * k) + " |");
}

console.log("\n## QUE PASA LOS DIAS QUE SALTA · el coste de la horquilla contra la cola que evita\n");
console.log("| regla | dias que salta | resultado medio de esos dias CON stop | ...si hubiera aguantado | diferencia |");
console.log("|---|---|---|---|---|");
for (const X of MULT) {
  const g = D.filter((d) => d["salto" + X] === 1);
  if (!g.length) { console.log("| " + X + "x | 0 | | | |"); continue; }
  const con = media(g.map((d) => d["stop" + X])), sin = media(g.map((d) => d.plVenc));
  console.log("| stop a " + X + "x el credito | " + g.length + " | " + eur(con) + " | " + eur(sin) + " | " + eur(con - sin) +
              (con > sin ? " el stop AHORRA" : " el stop CUESTA") + " |");
}

console.log("\n## POR TERCIOS · el mejor stop por ingreso/caida\n");
const mejor = MULT.reduce((a, b) => (R[b].anual / R[b].dd > R[a].anual / R[a].dd ? b : a));
const k3 = Math.floor(N / 3); let sig = "";
console.log("| tercio | n | aguantar $/op | stop " + mejor + "x $/op | aguantar caida | stop caida | aguantar peor | stop peor |");
console.log("|---|---|---|---|---|---|---|---|");
for (let i = 0; i < 3; i++) {
  const g = i < 2 ? D.slice(i * k3, (i + 1) * k3) : D.slice(2 * k3);
  const mb = metricas(g.map((d) => d.plVenc), g.length), ms = metricas(g.map((d) => d["stop" + mejor]), g.length);
  sig += ms.anual / ms.dd > mb.anual / mb.dd ? "+" : "−";
  console.log("| " + g[0].fecha + "→" + g[g.length - 1].fecha + " | " + g.length + " | " + eur(mb.media) + " | " + eur(ms.media) +
              " | " + eur(mb.dd) + " | " + eur(ms.dd) + " | " + eur(mb.peor) + " | " + eur(ms.peor) + " |");
}
console.log("\n  stop " + mejor + "x · signo de ingreso/caida por tercios: " + sig);

console.log("\n## LOS 12 PEORES DIAS, CON Y SIN STOP\n");
console.log("| fecha | aguantar | " + MULT.map((X) => "stop " + X + "x").join(" | ") + " | hora del disparo (" + mejor + "x) |");
console.log("|---|---|" + MULT.map(() => "---").join("|") + "|---|");
for (const d of [...D].sort((a, b) => a.plVenc - b.plVenc).slice(0, 12))
  console.log("| " + d.fecha + " | " + eur(d.plVenc) + " | " + MULT.map((X) => eur(d["stop" + X])).join(" | ") + " | " + (d["hora" + mejor] || "—") + " |");

writeFileSync("scripts/cola-9-resultado.json", JSON.stringify({ n: N, base: B, R }, null, 2), "utf8");
console.log("\n  liston de |t| para 79 pruebas = " + listonT(79) + " · detalle en scripts/cola-9-resultado.json");
