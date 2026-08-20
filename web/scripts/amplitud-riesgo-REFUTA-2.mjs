// REFUTACION · PARTE 2 — el punto que sí cede: la caida que "cabe en el efectivo" la manda
// UN dia, y el peor dia es justo la metrica que el filtro NO toca (y la que peor se hereda).
//
// Tambien: los dias de credito casi CERO con $5.000 de riesgo, que a ±45 y ±50 no son raros.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/amplitud-riesgo-REFUTA-2.mjs

import { readFileSync } from "node:fs";

const CUENTA = 56389, EFECTIVO = 7977;
const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct = (x) => (x == null || !Number.isFinite(x) ? "—" : (x * 100).toFixed(1) + "%");
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);

const { dias } = JSON.parse(readFileSync("scripts/amplitud-riesgo-dias.json", "utf8"));
const N = dias.length;
const MC = [5, 10, 20, 50];
const MA = {};
for (const k of MC) MA[k] = dias.map((_, i) => { if (i < k) return null; let s = 0; for (let j = i - k; j < i; j++) s += dias[j].cierre; return s / k; });
const ANCHO = 106;
const raya = (t) => { console.log("\n" + "═".repeat(ANCHO)); console.log("  " + t); console.log("═".repeat(ANCHO)); };

const CFG = { dist: 45, a: 5, b: 50 };
const opera = (i) => { const m1 = MA[CFG.a][i], m2 = MA[CFG.b][i]; return m1 != null && m2 != null && dias[i].sp11 >= m1 && dias[i].sp11 >= m2; };
const serie = (k = 1) => dias.map((d, i) => { const p = d.pnl[String(CFG.dist)]; return p != null && opera(i) ? p * k : 0; });

console.log(`\n# REFUTACION · PARTE 2 — el peor dia manda\n`);
console.log(`${N} sesiones · ${dias[0].fecha} → ${dias[N - 1].fecha} · ±${CFG.dist} sobre MA${CFG.a}+MA${CFG.b}`);

// ═══ 1 · DESCOMPONER LA CAIDA MAXIMA ════════════════════════════════════════════════════════
raya("1 · LA CAIDA MAXIMA DE −$6.932 — cuantas sesiones la forman");
const s = serie(1);
let cur = 0, pico = 0, peor = 0, iIni = 0, iFin = 0, iPico = 0;
for (let i = 0; i < N; i++) {
  cur += s[i];
  if (cur > pico) { pico = cur; iPico = i; }
  if (cur - pico < peor) { peor = cur - pico; iIni = iPico; iFin = i; }
}
const tramo = s.slice(iIni + 1, iFin + 1);
const opTramo = tramo.map((x, j) => ({ x, f: dias[iIni + 1 + j].fecha })).filter((o) => o.x !== 0);
const perdedores = opTramo.filter((o) => o.x < 0).sort((a, b) => a.x - b.x);
console.log(`\nCaida ${eur(peor)} · del ${dias[iIni].fecha} al ${dias[iFin].fecha} · ${iFin - iIni} sesiones de calendario, ${opTramo.length} operadas`);
console.log(`\n| sesion perdedora | perdida | % de la caida |`);
console.log("|---|---|---|");
for (const p of perdedores.slice(0, 6)) console.log(`| ${p.f} | ${eur(p.x)} | ${pct(p.x / peor)} |`);
console.log(`\n   El peor dia solo, ${eur(perdedores[0].x)}, es el ${pct(perdedores[0].x / peor)} de la caida maxima entera.`);
console.log(`   Suma de todos los ganadores del tramo: ${eur(suma(opTramo.filter((o) => o.x > 0).map((o) => o.x)))}`);

// ═══ 2 · LOS PEORES DIAS, CON Y SIN FILTRO ══════════════════════════════════════════════════
raya("2 · EL PEOR DIA — la unica metrica que el filtro NO mejora, y la que peor se hereda");
const sinF = dias.map((d) => d.pnl[String(CFG.dist)] ?? 0);
const conF = s;
const peores = (v) => [...v.map((x, i) => ({ x, f: dias[i].fecha }))].sort((a, b) => a.x - b.x).slice(0, 5);
console.log("\n| # | SIN filtro (±45 todos los dias) | CON filtro ±45·MA5+MA50 |");
console.log("|---|---|---|");
const pS = peores(sinF), pC = peores(conF);
for (let i = 0; i < 5; i++) console.log(`| ${i + 1} | ${pS[i].f}  ${eur(pS[i].x)} | ${pC[i].f}  ${eur(pC[i].x)} |`);
console.log(`\n   El peor dia del filtro (${eur(pC[0].x)}) es PEOR que el de no filtrar (${eur(pS[0].x)}).`);
console.log(`   El filtro no lo puede evitar: opera ese dia porque el indice estaba sobre sus dos medias.`);

// ═══ 3 · EL EFECTIVO CONTRA UNA REPETICION DEL PEOR DIA ═════════════════════════════════════
raya("3 · LO QUE DE VERDAD LIMITA EL TAMANO — un solo dia malo contra $7.977 de efectivo");
console.log(`
  El hallazgo argumenta el tamano con la CAIDA MAXIMA ("cabe: 0,87x tu efectivo"). Pero la caida
  se acumula a lo largo de semanas y se puede parar. Lo que no se para es un dia. Se compara el
  peor dia observado contra el efectivo, a cada tamano.
`);
console.log("| contratos | peor dia observado | % del efectivo | colateral | caida maxima | suelo de efectivo | dias en rojo |");
console.log("|---|---|---|---|---|---|---|");
for (const k of [1, 2, 3]) {
  const v = serie(k);
  let c = EFECTIVO, min = EFECTIVO, rojo = 0;
  for (const x of v) { c += x; if (c < min) min = c; if (c < 0) rojo++; }
  let cu = 0, pi = 0, pe = 0;
  for (const x of v) { cu += x; pi = Math.max(pi, cu); pe = Math.min(pe, cu - pi); }
  const pd = Math.min(...v);
  console.log(`| **${k}** | ${eur(pd)} | ${pct(-pd / EFECTIVO)} | ${eur(k * 5000)} | ${eur(pe)} | ${eur(min)} | ${rojo} |`);
}
console.log(`\n   A 2 contratos un solo dia como el ya visto vale ${eur(2 * Math.min(...serie(1)))} — mas que los $7.977 de efectivo,`);
console.log(`   sin necesidad de ninguna racha. La restriccion de "1 contrato" no es prudencia elegida: es un tope duro.`);

// ═══ 4 · LOS DIAS DE CREDITO CASI CERO ══════════════════════════════════════════════════════
raya("4 · LOS DIAS DE CREDITO RIDICULO — riesgo de $5.000 por cobrar calderilla");
console.log(`
  A ±45 el credito depende de la volatilidad. Se cuentan los dias operados por credito cobrado.
  Un condor con $5.000 de riesgo maximo y $25 de credito necesita 200 aciertos por cada fallo.
`);
const opDias = dias.map((d, i) => ({ d, i })).filter(({ d, i }) => opera(i) && d.pnl[String(CFG.dist)] != null);
const tramos = [[0, 25], [25, 50], [50, 100], [100, 200], [200, 1e9]];
console.log("\n| credito cobrado | dias | % de los operados | $ totales | peor dia | ratio riesgo:credito |");
console.log("|---|---|---|---|---|---|");
for (const [lo, hi] of tramos) {
  const g = opDias.filter(({ d }) => d.cred[String(CFG.dist)] >= lo && d.cred[String(CFG.dist)] < hi);
  if (!g.length) continue;
  const pl = g.map(({ d }) => d.pnl[String(CFG.dist)]);
  const cm = media(g.map(({ d }) => d.cred[String(CFG.dist)]));
  console.log(`| ${lo}–${hi === 1e9 ? "+" : hi} $ | ${g.length} | ${pct(g.length / opDias.length)} | ${eur(suma(pl))} | ${eur(Math.min(...pl))} | ${(5000 / Math.max(1, cm)).toFixed(0)}:1 |`);
}
const flojos = opDias.filter(({ d }) => d.cred[String(CFG.dist)] < 50);
console.log(`\n   ${flojos.length} de ${opDias.length} sesiones operadas (${pct(flojos.length / opDias.length)}) cobran menos de $50 por $5.000 de riesgo.`);
console.log(`   Aportan ${eur(suma(flojos.map(({ d }) => d.pnl[String(CFG.dist)])))} en total.`);

// ═══ 5 · UN SUELO DE CREDITO — el arreglo que falta, cruzado ════════════════════════════════
raya("5 · EL ARREGLO — anadir un suelo de credito, elegido en una mitad y aplicado a la otra");
const m2 = Math.floor(N / 2);
const H = [[0, m2], [m2, N]];
const nomH = [`H1 ${dias[0].fecha}→${dias[m2 - 1].fecha}`, `H2 ${dias[m2].fecha}→${dias[N - 1].fecha}`];
const evalSuelo = ([lo, hi], suelo) => {
  const v = [];
  for (let i = lo; i < hi; i++) {
    const p = dias[i].pnl[String(CFG.dist)], cr = dias[i].cred[String(CFG.dist)];
    v.push(p != null && opera(i) && cr >= suelo ? p : 0);
  }
  let cu = 0, pi = 0, pe = 0;
  for (const x of v) { cu += x; pi = Math.max(pi, cu); pe = Math.min(pe, cu - pi); }
  const o = [...v].sort((a, b) => a - b);
  return { n: v.filter((x) => x !== 0).length, a: suma(v) / (v.length / 252), c: pe,
           e: media(o.slice(0, Math.max(1, Math.round(v.length * 0.05)))), peor: Math.min(...v) };
};
const SUELOS = [0, 25, 50, 75, 100, 150, 200];
console.log("\n### El barrido, mitad a mitad\n");
console.log("| suelo de credito | " + nomH.map((x) => `${x.slice(0, 2)}: dias · $/ano · 5% peor`).join(" | ") + " |");
console.log("|---|---|---|");
for (const su of SUELOS) {
  const c = [0, 1].map((i) => { const m = evalSuelo(H[i], su); return `${m.n} · ${eur(m.a)} · ${eur(m.e)}`; });
  console.log(`| ≥ $${su} | ${c[0]} | ${c[1]} |`);
}
console.log("\n### El cruce: el suelo se elige por MENOR 5% peor en una mitad y se aplica a la otra\n");
console.log("| ajuste | suelo elegido | prueba | dias op. | $/ano | 5% peor | caida | vs suelo $0 |");
console.log("|---|---|---|---|---|---|---|---|");
let ganaSuelo = 0;
for (const [aj, pr] of [[0, 1], [1, 0]]) {
  const best = SUELOS.map((su) => ({ su, m: evalSuelo(H[aj], su) })).filter((x) => x.m.n >= 30).sort((x, y) => y.m.e - x.m.e)[0];
  const m = evalSuelo(H[pr], best.su), base = evalSuelo(H[pr], 0);
  const mejor = m.e > base.e;
  if (mejor) ganaSuelo++;
  console.log(`| ${nomH[aj].slice(0, 2)} | ≥ $${best.su} | ${nomH[pr].slice(0, 2)} | ${m.n} | ${eur(m.a)} | ${eur(m.e)} | ${eur(m.c)} | ${mejor ? "**mejor**" : "peor"} (${eur(base.e)}) |`);
}
console.log(`\n   → el suelo de credito mejora el 5% peor fuera de muestra en ${ganaSuelo} de 2 direcciones.`);
