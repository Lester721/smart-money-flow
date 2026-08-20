// EL CÓNDOR DE SPY CONTANDO LA ASIGNACIÓN · el coste que el backtest de las 16:00 no ve
//
// SPY es AMERICANA y se entrega en ACCIONES. Cuando una pata corta acaba dentro del dinero y su
// ala NO, el cierre de la sesión no liquida nada: deja 100 acciones (largas si fue la put, cortas
// si fue la call) que hay que vender en la siguiente apertura. Ese hueco nocturno NO está en
// ninguna de las cifras anteriores, ni en las mías ni en las de los diecinueve agentes previos.
//
// Aquí se añade: P&L del cóndor liquidado a las 16:00  +  hueco nocturno de las acciones asignadas
// vendidas en la apertura siguiente. Con eso se recalculan $/año, peor día y CAÍDA.
//
// Lo que NO se puede medir con estos datos, y se dice: el ejercicio entre las 16:00 y las 17:30
// (una corta que acaba FUERA por céntimos puede acabar ejercida con lo que pase después del
// cierre). Para eso harían falta los precios de SPY en esa ventana y no están en cache-theta/.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/tamano-spy-con-asignacion.mjs

import { readFileSync, readdirSync } from "node:fs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT } from "../lib/barreraHallazgos.ts";

const TOTAL0 = 56389, EFECTIVO0 = 7977, HOOD = TOTAL0 - EFECTIVO0, PODER0 = 73874, INTERES = 0.05;
const PRUEBAS = 229, LISTON = listonT(PRUEBAS);
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pc = (x) => (x * 100).toFixed(1) + "%";
const med = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const perc = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const tDe = (v) => { const m = med(v), s = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); return m / (s / Math.sqrt(v.length)); };
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const difDias = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5);

const DIR = "scripts/cache-theta/spy-0dte";
const fechas = readdirSync(DIR).map((f) => (f.match(/^(\d{4}-\d{2}-\d{2})\.json$/) || [])[1]).filter(Boolean).sort();
const crudo = [];
for (const fe of fechas) {
  const j = JSON.parse(readFileSync(`${DIR}/${fe}.json`, "utf8"));
  if (!Array.isArray(j) || !j.length) continue;
  const C = [], P = []; let spot = 0, cierre = 0, apertura = 0, hF = "", hI = "99:99";
  for (const r of j) {
    const [h, l, K, b, a, , U] = r;
    if (U > 0 && h >= hF) { hF = h; cierre = U; }
    if (U > 0 && h < hI) { hI = h; apertura = U; }
    if (h !== "11:00") continue;
    if (U > 0 && !spot) spot = U;
    if (K > 0 && b >= 0 && a > 0) (l === "C" ? C : P).push({ K, bid: b, ask: a });
  }
  if (!(spot > 0 && cierre > 0 && apertura > 0 && C.length && P.length)) continue;
  const cC = cerca(C, spot + 2.5), pC = cerca(P, spot - 2.5);
  const cL = cerca(C, cC.K + 5), pL = cerca(P, pC.K - 5);
  if (cL.K <= cC.K || pL.K >= pC.K) continue;
  const cred = cC.bid + pC.bid - cL.ask - pL.ask; if (!(cred > 0)) continue;
  crudo.push({ fecha: fe, apertura, cierre, kc: cC.K, kp: pC.K, klc: cL.K, klp: pL.K,
    plCondor: (cred - Math.min(Math.max(cierre - cC.K, 0), cL.K - cC.K)
                    - Math.min(Math.max(pC.K - cierre, 0), pC.K - pL.K)) * 100 - 8 * 0.03 });
}

// ── añadir el hueco nocturno de las acciones asignadas ───────────────────────────────────────
const dias = [];
for (let i = 0; i < crudo.length; i++) {
  const d = crudo[i], sig = crudo[i + 1];
  let acciones = 0, plNoche = 0, expuesto = false;
  const putITM = d.cierre < d.kp, callITM = d.cierre > d.kc;
  const putProt = d.cierre < d.klp, callProt = d.cierre > d.klc;
  if (putITM && !putProt) acciones = +100;     // asignado: compra 100 acciones al strike
  if (callITM && !callProt) acciones = -100;   // asignado: vende 100 acciones al strike
  if (acciones !== 0 && sig) { plNoche = acciones * (sig.apertura - d.cierre); expuesto = true; }
  dias.push({ ...d, acciones, plNoche, expuesto, pl: d.plCondor + plNoche });
}
radiografia(dias, ["plCondor", "pl", "cierre", "apertura"], "SPY con asignación",
  { cerosLegitimos: [] });

const nExp = dias.filter((x) => x.expuesto).length;
console.log(`días: ${dias.length} · con acciones asignadas y sin cubrir: ${nExp} (${pc(nExp / dias.length)})`);
console.log(`  hueco nocturno: media ${eur(med(dias.filter((x) => x.expuesto).map((x) => x.plNoche)))}/contrato · ` +
  `t=${tDe(dias.filter((x) => x.expuesto).map((x) => x.plNoche)).toFixed(2)} · ` +
  `peor ${eur(Math.min(...dias.map((x) => x.plNoche)))} · mejor ${eur(Math.max(...dias.map((x) => x.plNoche)))}`);
console.log(`  p05 ${eur(perc(dias.filter((x) => x.expuesto).map((x) => x.plNoche), 0.05))} · p50 ${eur(perc(dias.filter((x) => x.expuesto).map((x) => x.plNoche), 0.5))}`);

// ── la caja ──────────────────────────────────────────────────────────────────────────────────
function caja(serie, k, campo) {
  let efe = EFECTIVO0, interes = 0, pico = TOTAL0, peor = 0, peorEfe = EFECTIVO0, llamada = null, prev = null;
  const pls = [];
  for (const d of serie) {
    if (prev && efe < 0) { const i2 = -efe * INTERES * (difDias(prev, d.fecha) / 365); interes += i2; efe -= i2; }
    prev = d.fecha;
    if (PODER0 + 2 * (efe - EFECTIVO0) < 500 * k && !llamada) llamada = d.fecha;
    const pl = campo(d) * k; pls.push(pl); efe += pl;
    peorEfe = Math.min(peorEfe, efe);
    const eq = HOOD + efe; pico = Math.max(pico, eq); peor = Math.max(peor, pico - eq);
  }
  return { porAno: (efe - EFECTIVO0) / (serie.length / 252), peorDia: Math.min(...pls),
    p1: perc(pls, 0.01), p5: perc(pls, 0.05), peorRacha: peor, caida: peor / TOTAL0,
    peorEfe, llamada, interes, pls };
}
const A = dias.filter((d) => d.fecha < "2024-01-01"), B = dias.filter((d) => d.fecha >= "2024-01-01");

console.log(`\n${"═".repeat(108)}\nCON Y SIN LA ASIGNACIÓN · lo que cambia al contar las acciones que quedan de un día a otro\n${"═".repeat(108)}\n`);
console.log("| tamaño | | $/año | peor día | p1 | p5 | peor racha | caída | efectivo mínimo | ¿llamada? | 22-23 | 24-26 |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const k of [1, 3, 5, 8, 10]) {
  for (const [et, campo] of [["sólo el cóndor (lo que se venía midiendo)", (d) => d.plCondor], ["**+ la asignación**", (d) => d.pl]]) {
    const r = caja(dias, k, campo), a = caja(A, k, campo), b = caja(B, k, campo);
    console.log(`| ${k} cóndor(es) SPY | ${et} | ${eur(r.porAno)} | ${eur(r.peorDia)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(-r.peorRacha)} | ${pc(r.caida)} | ${eur(r.peorEfe)} | ${r.llamada ?? "no"} | ${eur(a.porAno)} | ${eur(b.porAno)} |`);
  }
}

// ── la criba de tercios sobre la serie CON asignación ────────────────────────────────────────
console.log(`\n${"═".repeat(108)}\nCRIBA DE TERCIOS · sobre la serie que SÍ cuenta la asignación\n${"═".repeat(108)}\n`);
const k3 = Math.floor(dias.length / 3);
console.log("| tercio | días | $/año 3 cóndores | ganados | t |");
console.log("|---|---|---|---|---|");
const sig = [];
for (let i = 0; i < 3; i++) {
  const g = i < 2 ? dias.slice(i * k3, (i + 1) * k3) : dias.slice(2 * k3);
  const v = g.map((x) => x.pl * 3);
  sig.push(Math.sign(med(v)));
  console.log(`| ${g[0].fecha} → ${g.at(-1).fecha} | ${g.length} | ${eur(med(v) * 252)} | ${pc(v.filter((x) => x > 0).length / v.length)} | ${tDe(v).toFixed(2)} |`);
}
console.log(`\n  mismo signo en los tres tercios: ${sig.every((s) => s === sig[0]) ? "SÍ" : "**NO**"}`);
console.log(`  |t| global (1 cóndor, con asignación): ${tDe(dias.map((x) => x.pl)).toFixed(2)} · listón ${LISTON} → ${Math.abs(tDe(dias.map((x) => x.pl))) >= LISTON ? "PASA" : "**NO PASA**"}`);

// ── prueba cruzada del tamaño, con asignación ────────────────────────────────────────────────
console.log(`\n${"═".repeat(108)}\nPRUEBA CRUZADA DEL TAMAÑO · con asignación contada · elegido en un período, aplicado al otro\n${"═".repeat(108)}\n`);
const mayor = (S, techo) => { let m = 0; for (let k = 1; k <= 40; k++) { const r = caja(S, k, (d) => d.pl); if (r.caida <= techo && !r.llamada && Math.abs(r.peorDia) <= EFECTIVO0) m = k; else break; } return m; };
console.log("| techo | elegido en 22-23 | $/año fuera | caída fuera | ¿cumple fuera? | elegido en 24-26 | $/año fuera | caída fuera | ¿cumple fuera? |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const techo of [0.15, 0.25]) {
  const kA = mayor(A, techo), kB = mayor(B, techo);
  const fA = kA ? caja(B, kA, (d) => d.pl) : null, fB = kB ? caja(A, kB, (d) => d.pl) : null;
  console.log(`| ${pc(techo)} | ${kA || "**0**"} | ${fA ? eur(fA.porAno) : "—"} | ${fA ? pc(fA.caida) : "—"} | ${fA ? (fA.caida <= techo && fA.porAno > 0 ? "SÍ" : "**NO**") : "—"} | ${kB || "**0**"} | ${fB ? eur(fB.porAno) : "—"} | ${fB ? pc(fB.caida) : "—"} | ${fB ? (fB.caida <= techo && fB.porAno > 0 ? "SÍ" : "**NO**") : "—"} |`);
}
console.log(`\n  Y el tamaño FIJO que respeta el techo en LOS DOS períodos a la vez:`);
for (const techo of [0.15, 0.25]) {
  let m = 0;
  for (let k = 1; k <= 40; k++) {
    const a = caja(A, k, (d) => d.pl), b = caja(B, k, (d) => d.pl), tt = caja(dias, k, (d) => d.pl);
    if (a.caida <= techo && b.caida <= techo && tt.caida <= techo && !tt.llamada && Math.abs(tt.peorDia) <= EFECTIVO0) m = k; else break;
  }
  const r = m ? caja(dias, m, (d) => d.pl) : null;
  console.log(`    techo ${pc(techo)} → ${m} cóndores SPY` + (r ? ` · colateral ${eur(500 * m)} (${pc(500 * m / TOTAL0)}) · ${eur(r.porAno)}/año · caída ${pc(r.caida)} · peor día ${eur(r.peorDia)} · efectivo mínimo ${eur(r.peorEfe)} · 22-23 ${eur(caja(A, m, (d) => d.pl).porAno)} · 24-26 ${eur(caja(B, m, (d) => d.pl).porAno)}` : ""));
}
console.log("\n" + "═".repeat(108));
