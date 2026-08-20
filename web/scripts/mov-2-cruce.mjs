// PASO 4 — EL CRUCE. Se elige en un período y se aplica TAL CUAL al otro. En las dos direcciones.
//
// REGLA DE SELECCIÓN, escrita ANTES de mirar ningún resultado del cruce:
//   Entre los umbrales que en el período de AJUSTE (a) dejan de operar entre el 5% y el 35% de los
//   días y (b) recortan la peor racha al menos un 15%, se elige el de MENOR coste:
//        coste = $/año de ingreso perdido ÷ $ de caída eliminada.
//   Empate → el que deje de operar menos días. El umbral elegido se aplica al otro período SIN
//   TOCAR NI UN NÚMERO.
//
// Se prueban las 15 señales en las 2 direcciones de la desigualdad y en las 2 direcciones del
// cruce = 60 combinaciones. Ese es el número de pruebas que entra en el listón de Bonferroni.
import { listonT } from "../lib/barreraHallazgos";
import { construir, cola, media, sd, pct, eur, racha, tWelch } from "./mov-lib.mjs";

const SENALES = ["movSig","huecoSig","rangoSig","posRango","recorridoSig","velMaxSig","vel30Sig",
                 "eficiencia","zigzag","rvManana","rvIv","rangoAyerSig","rangoAnteSig","tardeAyerSig","sepSig"];
const PRUEBAS = SENALES.length * 2 * 2;
const LIST = listonT(PRUEBAS);

const F = construir().filter((f) => f.huecoSig != null && f.rangoAnteSig != null && f.vel30Sig != null && f.rvIv != null);
const A = F.filter((f) => f.fecha < "2024-01-01"), B = F.filter((f) => f.fecha >= "2024-01-01");

/** métricas de una selección de días, con el año-base del período ENTERO (no del filtrado) */
function met(sel, nTotal) {
  const pl = sel.map((f) => f.pl), anos = nTotal / 252;
  const tot = pl.reduce((a, b) => a + b, 0);
  return { n: pl.length, alAno: tot / anos, peor: Math.min(...pl), p1: pct(pl, 0.01), p5: pct(pl, 0.05),
           dd: racha(pl), p2000: pl.filter((x) => x < -2000).length / pl.length,
           p4000: pl.filter((x) => x < -4000).length / pl.length };
}
function evalua(G, opera) {
  const base = met(G, G.length), filt = met(G.filter(opera), G.length);
  const ingresoPerdido = base.alAno - filt.alAno;
  const caidaEliminada = Math.abs(base.dd) - Math.abs(filt.dd);
  return { base, filt, ingresoPerdido, caidaEliminada,
           coste: caidaEliminada > 0 ? ingresoPerdido / caidaEliminada : Infinity,
           fueraPct: 1 - filt.n / G.length };
}

// ── el buscador de umbral, ciego al período de prueba ──
function elegir(FIT, s, sentido) {
  const vals = FIT.map((f) => f[s]).sort((a, b) => a - b);
  let mejor = null;
  for (let q = 0.02; q <= 0.98; q += 0.01) {
    const u = vals[Math.floor(vals.length * (sentido > 0 ? 1 - q : q))];
    const opera = sentido > 0 ? (f) => f[s] <= u : (f) => f[s] >= u;
    const e = evalua(FIT, opera);
    if (e.fueraPct < 0.05 || e.fueraPct > 0.35) continue;
    if (e.caidaEliminada < Math.abs(e.base.dd) * 0.15) continue;
    if (!mejor || e.coste < mejor.e.coste - 1e-9 ||
        (Math.abs(e.coste - mejor.e.coste) < 1e-9 && e.fueraPct < mejor.e.fueraPct)) mejor = { u, e };
  }
  return mejor;
}

// ── el control que ya tumbó a otros: quitar el MISMO nº de días AL AZAR, 500 sorteos ──
function azar(G, nFuera, sorteos = 500) {
  const dd = [], ano = [];
  let semilla = 12345;
  const rnd = () => (semilla = (semilla * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let k = 0; k < sorteos; k++) {
    const idx = G.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const fuera = new Set(idx.slice(0, nFuera));
    const sel = G.filter((_, i) => !fuera.has(i));
    const m = met(sel, G.length);
    dd.push(m.dd); ano.push(m.alAno);
  }
  return { dd, ano };
}

console.log(`\n# EL CRUCE · ${PRUEBAS} pruebas declaradas · listón de |t| = ${LIST}`);
console.log(`  2022-2023: ${A.length} días · 2024-2026: ${B.length} días\n`);

const DIRS = [["AJUSTA 22-23 → PRUEBA 24-26", A, B], ["AJUSTA 24-26 → PRUEBA 22-23", B, A]];
const res = {};
for (const [et, FIT, TEST] of DIRS) {
  console.log(`\n## ${et}\n`);
  console.log("| señal | regla elegida en el ajuste | fuera ajuste | coste ajuste | fuera PRUEBA | Δ$/año PRUEBA | Δcaída PRUEBA | coste PRUEBA | ¿mejora la caída? |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const s of SENALES) {
    for (const sentido of [1, -1]) {
      const el = elegir(FIT, s, sentido);
      const clave = `${s}|${sentido}`;
      if (!el) { console.log(`| ${s} ${sentido > 0 ? "alto" : "bajo"} | — ningún umbral cumple la regla de selección — | | | | | | | |`); (res[clave] ??= {})[et] = null; continue; }
      const opera = sentido > 0 ? (f) => f[s] <= el.u : (f) => f[s] >= el.u;
      const e = evalua(TEST, opera);
      const nombre = `no operar si ${s} ${sentido > 0 ? ">" : "<"} ${el.u.toPrecision(4)}`;
      console.log(`| ${s} | ${nombre} | ${(el.e.fueraPct*100).toFixed(0)}% | $${el.e.coste.toFixed(2)} | ${(e.fueraPct*100).toFixed(0)}% | ${eur(-e.ingresoPerdido)} | ${eur(e.caidaEliminada)} | ${e.caidaEliminada>0?"$"+e.coste.toFixed(2):"—"} | ${e.caidaEliminada > 0 ? "sí" : "**NO**"} |`);
      (res[clave] ??= {})[et] = { u: el.u, sentido, ajuste: el.e, prueba: e, nombre };
    }
  }
}

// ── QUIÉN SOBREVIVE LAS DOS DIRECCIONES ──
console.log(`\n\n## ═══ QUIÉN SOBREVIVE EL CRUCE EN LAS DOS DIRECCIONES ═══\n`);
console.log("Criterio: recorta la peor racha en el período de PRUEBA en las DOS direcciones.\n");
console.log("| señal | dir 1: Δcaída | dir 1: Δ$/año | dir 2: Δcaída | dir 2: Δ$/año | sobrevive |");
console.log("|---|---|---|---|---|---|");
const supervivientes = [];
for (const [clave, r] of Object.entries(res)) {
  const d1 = r[DIRS[0][0]], d2 = r[DIRS[1][0]];
  if (!d1 || !d2) continue;
  const ok = d1.prueba.caidaEliminada > 0 && d2.prueba.caidaEliminada > 0;
  console.log(`| ${clave} | ${eur(d1.prueba.caidaEliminada)} | ${eur(-d1.prueba.ingresoPerdido)} | ${eur(d2.prueba.caidaEliminada)} | ${eur(-d2.prueba.ingresoPerdido)} | ${ok ? "**SÍ**" : "no"} |`);
  if (ok) supervivientes.push([clave, d1, d2]);
}
console.log(`\n  ${supervivientes.length} de ${Object.keys(res).length} combinaciones sobreviven.`);

// ── EL CONTROL DEL AZAR sobre los supervivientes ──
if (supervivientes.length) {
  console.log(`\n\n## ═══ ¿LE GANA AL AZAR? — 500 sorteos quitando el MISMO nº de días ═══\n`);
  console.log("| señal | dirección | días fuera | caída real | caída mediana del azar | percentil | $/año real | $/año mediano azar |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const [clave, d1, d2] of supervivientes) {
    for (const [et, d, TEST] of [["→24-26", d1, B], ["→22-23", d2, A]]) {
      const nFuera = TEST.length - d.prueba.filt.n;
      const az = azar(TEST, nFuera);
      const ddOrd = [...az.dd].sort((a, b) => a - b);
      const perc = ddOrd.filter((x) => x < d.prueba.filt.dd).length / ddOrd.length;
      console.log(`| ${clave} | ${et} | ${nFuera} | ${eur(d.prueba.filt.dd)} | ${eur(pct(az.dd, 0.5))} | ${(perc*100).toFixed(0)}% mejor que el ${((1-perc)*100).toFixed(0)}% | ${eur(d.prueba.filt.alAno)} | ${eur(pct(az.ano, 0.5))} |`);
    }
  }
}
