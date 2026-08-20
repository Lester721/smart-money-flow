// LA REJILLA FINAL DEL TAMAÑO · ancho de ala × cadencia × contratos
//
// Pregunta única: ¿existe ALGÚN tamaño de este cóndor que (a) gane dinero en los DOS períodos y
// (b) mantenga la caída por debajo del 15% / 25% de la cuenta? Se elige en un período y se
// comprueba en el otro. En las dos direcciones.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/tamano-rejilla.mjs

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT } from "../lib/barreraHallazgos.ts";

const TOTAL0 = 56389, EFECTIVO0 = 7977, HOOD = TOTAL0 - EFECTIVO0, PODER0 = 73874, INTERES = 0.05;
const dias = JSON.parse(readFileSync("scripts/tamano-serie.json", "utf8"));
radiografia(dias, ["pl", "credito", "mov"], "serie del cóndor (rejilla)");
const D22 = dias.filter((d) => d.fecha < "2024-01-01");
const D24 = dias.filter((d) => d.fecha >= "2024-01-01");

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pc = (x) => (x * 100).toFixed(1) + "%";
const med = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const difDias = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5);

const ALAS = [10, 15, 20, 25, 30, 40, 50], CADS = [1, 2, 3, 4], KS = [1, 2, 3];

/** Un tamaño = (ala, cadencia, contratos). Se mide siempre sobre el CALENDARIO completo. */
function medir(serie, calendario, { ala, cad, k }) {
  const operados = serie.filter((d, i) => i % cad === 0 && d.porAla[ala] && d.porAla[ala].credito > 0);
  if (operados.length < 30) return null;
  let eq = TOTAL0, pico = TOTAL0, peor = 0, total = 0, peorDia = 0, gan = 0;
  // caja: efectivo real e intereses de margen
  let efe = EFECTIVO0, interes = 0, peorEfe = EFECTIVO0, llamada = null, prev = null;
  for (const d of operados) {
    const pl = d.porAla[ala].pl * k;
    total += pl; peorDia = Math.min(peorDia, pl); if (pl > 0) gan++;
    eq += pl; pico = Math.max(pico, eq); peor = Math.max(peor, pico - eq);
    if (prev && efe < 0) { const i2 = -efe * INTERES * (difDias(prev, d.fecha) / 365); interes += i2; efe -= i2; }
    prev = d.fecha;
    if (PODER0 + 2 * (efe - EFECTIVO0) < (ala * 100 * k) && !llamada) llamada = d.fecha;
    efe += pl; peorEfe = Math.min(peorEfe, efe);
  }
  const anos = calendario.length / 252;   // el año es el año, se opere o no
  return {
    nOp: operados.length, total, porAno: total / anos, netoAno: (total - interes) / anos, interes,
    peorDia, peorRacha: peor, caida: peor / TOTAL0, ganados: gan / operados.length,
    colateral: ala * 100 * k, pctCuenta: (ala * 100 * k) / TOTAL0,
    peorEfe, llamada, efectivoCubre: Math.abs(peorDia) <= EFECTIVO0,
    ratio: peor > 0 ? (total / anos) / peor : NaN,
  };
}

// ═══ 1 · LA REJILLA COMPLETA, LOS DOS PERÍODOS A LA VEZ ══════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log(`1 · LA REJILLA · ${ALAS.length} alas × ${CADS.length} cadencias × ${KS.length} tamaños = ${ALAS.length * CADS.length * KS.length} combinaciones`);
console.log(`${"═".repeat(104)}\n`);
const todas = [];
for (const ala of ALAS) for (const cad of CADS) for (const k of KS) {
  const cfg = { ala, cad, k };
  const T = medir(dias, dias, cfg), A = medir(D22, D22, cfg), B = medir(D24, D24, cfg);
  if (!T || !A || !B) continue;
  todas.push({ cfg, T, A, B, dosSignos: A.porAno > 0 && B.porAno > 0 });
}
console.log(`  combinaciones medidas: ${todas.length}`);
const gananLasDos = todas.filter((x) => x.dosSignos);
console.log(`  que GANAN DINERO en los dos períodos por separado: ${gananLasDos.length}`);
const bajo25 = todas.filter((x) => x.T.caida <= 0.25 && x.A.caida <= 0.25 && x.B.caida <= 0.25);
console.log(`  que mantienen la caída ≤25% de la cuenta en los dos períodos: ${bajo25.length}`);
const bajo15 = todas.filter((x) => x.T.caida <= 0.15 && x.A.caida <= 0.15 && x.B.caida <= 0.15);
console.log(`  que mantienen la caída ≤15% de la cuenta en los dos períodos: ${bajo15.length}`);
const ambas25 = todas.filter((x) => x.dosSignos && x.T.caida <= 0.25 && x.A.caida <= 0.25 && x.B.caida <= 0.25);
console.log(`  que cumplen LAS DOS COSAS (gana en los dos Y caída ≤25%): ${ambas25.length}`);

console.log(`\n  Las 12 combinaciones con MENOS caída, ordenadas, con lo que ganan en cada período:\n`);
console.log("| ala | cadencia | contratos | colateral | % cuenta | caída 22-26 | caída 22-23 | caída 24-26 | $/año 22-26 | $/año 22-23 | $/año 24-26 | peor día | ¿gana en los dos? |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const x of [...todas].sort((p, q) => p.T.caida - q.T.caida).slice(0, 12))
  console.log(`| ${x.cfg.ala} | 1 de ${x.cfg.cad} | ${x.cfg.k} | ${eur(x.T.colateral)} | ${pc(x.T.pctCuenta)} | ${pc(x.T.caida)} | ${pc(x.A.caida)} | ${pc(x.B.caida)} | ${eur(x.T.porAno)} | ${eur(x.A.porAno)} | ${eur(x.B.porAno)} | ${eur(x.T.peorDia)} | ${x.dosSignos ? "sí" : "**NO**"} |`);

console.log(`\n  Las 8 que MÁS ganan sobre todo el período, para ver qué caída piden a cambio:\n`);
console.log("| ala | cadencia | contratos | $/año 22-26 | $/año 22-23 | $/año 24-26 | caída 22-26 | peor día | ¿gana en los dos? |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const x of [...todas].sort((p, q) => q.T.porAno - p.T.porAno).slice(0, 8))
  console.log(`| ${x.cfg.ala} | 1 de ${x.cfg.cad} | ${x.cfg.k} | ${eur(x.T.porAno)} | ${eur(x.A.porAno)} | ${eur(x.B.porAno)} | ${pc(x.T.caida)} | ${eur(x.T.peorDia)} | ${x.dosSignos ? "sí" : "**NO**"} |`);

// ═══ 2 · LA PRUEBA CRUZADA DEL TAMAÑO ════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}\n2 · PRUEBA CRUZADA · se elige el mejor tamaño en un período y se aplica TAL CUAL al otro\n${"═".repeat(104)}\n`);
function elegir(serie, techo) {
  // el que más dinero da entre los que respetan el techo de caída y los cubre el efectivo
  const cand = [];
  for (const ala of ALAS) for (const cad of CADS) for (const k of KS) {
    const r = medir(serie, serie, { ala, cad, k });
    if (r && r.caida <= techo && r.efectivoCubre && !r.llamada) cand.push({ cfg: { ala, cad, k }, r });
  }
  cand.sort((p, q) => q.r.porAno - p.r.porAno);
  return cand[0] ?? null;
}
for (const techo of [0.15, 0.25]) {
  console.log(`### techo de caída ${pc(techo)} (${eur(techo * TOTAL0)}) · además el peor día tiene que caber en los ${eur(EFECTIVO0)} de efectivo\n`);
  console.log("| se elige mirando | tamaño elegido | $/año ahí | caída ahí | → aplicado a | $/año FUERA | caída FUERA | ¿gana fuera? | ¿respeta el techo fuera? |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const [etA, SA, etB, SB] of [["2022-2023", D22, "2024-2026", D24], ["2024-2026", D24, "2022-2023", D22]]) {
    const e = elegir(SA, techo);
    if (!e) { console.log(`| ${etA} | **ninguno cumple** | — | — | ${etB} | — | — | — | — |`); continue; }
    const f = medir(SB, SB, e.cfg);
    console.log(`| ${etA} | ala ${e.cfg.ala}, 1 de ${e.cfg.cad}, ${e.cfg.k} contrato(s) | ${eur(e.r.porAno)} | ${pc(e.r.caida)} | ${etB} | ${eur(f.porAno)} | ${pc(f.caida)} | ${f.porAno > 0 ? "SÍ" : "**NO**"} | ${f.caida <= techo ? "SÍ" : "**NO**"} |`);
  }
  console.log("");
}

// ═══ 3 · EL EFECTIVO QUE HARÍA FALTA ═════════════════════════════════════════════════════════
console.log(`${"═".repeat(104)}\n3 · ¿CUÁNTO EFECTIVO HARÍA FALTA? · lo que hay que tapar para que ningún tamaño llame al margen\n${"═".repeat(104)}\n`);
console.log("| tamaño | peor pérdida acumulada 22-26 | peor 22-23 | peor 24-26 | efectivo que tiene | ¿le falta? |");
console.log("|---|---|---|---|---|---|");
for (const cfg of [{ ala: 50, cad: 1, k: 1 }, { ala: 50, cad: 1, k: 2 }, { ala: 25, cad: 1, k: 1 }, { ala: 25, cad: 2, k: 1 }, { ala: 15, cad: 1, k: 1 }, { ala: 10, cad: 2, k: 1 }]) {
  const T = medir(dias, dias, cfg), A = medir(D22, D22, cfg), B = medir(D24, D24, cfg);
  const falta = T.peorRacha - EFECTIVO0;
  console.log(`| ala ${cfg.ala}, 1 de ${cfg.cad}, ${cfg.k}c | ${eur(T.peorRacha)} | ${eur(A.peorRacha)} | ${eur(B.peorRacha)} | ${eur(EFECTIVO0)} | ${falta > 0 ? "**faltan " + eur(falta) + "**" : "no"} |`);
}
console.log(`\n  Traducción: para aguantar UN cóndor de ala 50 desde 2022 sin que le llamen al margen habría`);
console.log(`  necesitado ${eur(medir(dias, dias, { ala: 50, cad: 1, k: 1 }).peorRacha)} de efectivo. Tiene ${eur(EFECTIVO0)}. Eso son ${(medir(dias, dias, { ala: 50, cad: 1, k: 1 }).peorRacha / EFECTIVO0).toFixed(1)} veces lo que hay en caja.`);

// ═══ 4 · DÓNDE SE CONCENTRA EL DAÑO ══════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}\n4 · LA CONCENTRACIÓN · el tamaño tiene que dimensionarse contra el PEOR MES, no contra la media\n${"═".repeat(104)}\n`);
const meses = {};
for (const d of dias) (meses[d.fecha.slice(0, 7)] ??= []).push(d.pl);
const ord = Object.entries(meses).map(([m, v]) => ({ m, n: v.length, s: v.reduce((a, b) => a + b, 0) })).sort((a, b) => a.s - b.s);
console.log("  los 8 peores meses (1 contrato, ala 50):");
for (const x of ord.slice(0, 8)) console.log(`    ${x.m}  n=${String(x.n).padStart(2)}  ${eur(x.s).padStart(9)}`);
console.log("  los 4 mejores:");
for (const x of ord.slice(-4).reverse()) console.log(`    ${x.m}  n=${String(x.n).padStart(2)}  ${eur(x.s).padStart(9)}`);
const total = ord.reduce((a, x) => a + x.s, 0);
console.log(`\n  suma de TODOS los meses: ${eur(total)} · el peor mes solo (${ord[0].m}) vale ${eur(ord[0].s)},`);
console.log(`  que es ${(Math.abs(ord[0].s) / Math.abs(total)).toFixed(1)}× el resultado total de los 4 años y medio.`);
const sinPeor = total - ord[0].s;
console.log(`  quitando ese único mes el total pasa de ${eur(total)} a ${eur(sinPeor)} — un solo mes decide el signo.`);

// ═══ 5 · EL RECUENTO ═════════════════════════════════════════════════════════════════════════
const PRUEBAS = todas.length + 8;
console.log(`\n${"═".repeat(104)}`);
console.log(`RECUENTO: ${todas.length} combinaciones de tamaño medidas + 8 lecturas auxiliares = ${PRUEBAS} pruebas.`);
console.log(`Listón de |t| (Bonferroni, ${PRUEBAS} pruebas): ${listonT(PRUEBAS)}`);
const pls = dias.map((d) => d.pl), m = med(pls);
const sd = Math.sqrt(pls.reduce((a, x) => a + (x - m) ** 2, 0) / (pls.length - 1));
console.log(`|t| de la estrategia base (1 contrato, ala 50, todos los días, n=${pls.length}): ${(m / (sd / Math.sqrt(pls.length))).toFixed(2)}`);
console.log(`Con ${PRUEBAS} pruebas hace falta ${listonT(PRUEBAS)}. No llega ni de lejos.`);
console.log("═".repeat(104));
