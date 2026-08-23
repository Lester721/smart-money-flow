// LENTE 2 (5ª parte) — EL VEREDICTO: las dos candidatas en la cuenta REAL de Lester,
// con la ejecución castigada.
//
// Todo lo anterior junto en una sola tabla comparable:
//   · arranque con $7.977 de efectivo, ventanas de 12 meses rodantes empezando en cada operación;
//   · colateral retenido por Robinhood = ancho del ala × 100 por contrato;
//   · si no hay efectivo para el colateral, ese día NO se opera (se espera, no se quiebra);
//   · y todo repetido con MEDIA HORQUILLA MÁS de peaje por pata al entrar, que es el castigo
//     de ejecución que ya mató a la mariposa de hierro del encargo anterior.
//
// Uso: node --import tsx scripts/v2-lente2-veredicto.mjs

import { diasDisponibles, cargarDia, rejilla, condor, estructura, hayHora } from "./lib0dte.mjs";

const ANCHO = 45, HORA = "11:00", MA_CORTA = 5, MA_LARGA = 50, DIAS_ANO = 244, COMISION = 0.24;
const EFECTIVO = 7977;
const ALAS = [50, 25, 20, 15];
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
function pct(v, p) { const s = [...v].sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo); }

const R = [];
for (const d of diasDisponibles()) {
  const dia = cargarDia(d);
  if (!dia) continue;
  const cierre = dia.barras[dia.barras.length - 1].spot;
  const i = hayHora(dia, HORA);
  const porAla = {};
  if (i >= 0) {
    const b = dia.barras[i], centro = rejilla(b.spot);
    for (const ala of ALAS) {
      const patas = condor(centro, ANCHO, ala);
      const pares = patas.map((p) => b.o.get(p.K + p.lado));
      const r = estructura(dia, i, "vencimiento", patas);
      if (!r || pares.some((x) => !x)) { porAla[ala] = null; continue; }
      const horq = suma(pares.map(([bi, as]) => as - bi)) * 100;
      porAla[ala] = { spot: b.spot, credito: r.credito * 100, dolares: r.dolares - COMISION, horq };
    }
  }
  R.push({ dia: d, cierre, porAla });
}
const cierres = R.map((x) => x.cierre);
for (let i = 0; i < R.length; i++) {
  if (i < MA_LARGA) { R[i].ma50 = null; continue; }
  R[i].ma5 = media(cierres.slice(i - MA_CORTA, i));
  R[i].ma50 = media(cierres.slice(i - MA_LARGA, i));
}
const CONMA = R.filter((x) => x.ma50 != null);
const ANOS = CONMA.length / DIAS_ANO;

function correr(ala, umbral, castigo) {
  return CONMA.filter((x) => x.porAla[ala] && x.porAla[ala].spot > x.ma5 && x.porAla[ala].spot > x.ma50 && x.porAla[ala].credito >= umbral)
    .map((x) => ({ dia: x.dia, pl: x.porAla[ala].dolares - (castigo ? x.porAla[ala].horq / 2 : 0) }));
}

function ventanas(ops, colateral, contratos) {
  const res = [];
  for (let k = 0; k < ops.length; k++) {
    const fin = new Date(ops[k].dia); fin.setFullYear(fin.getFullYear() + 1);
    const finS = fin.toISOString().slice(0, 10);
    if (ops[ops.length - 1].dia < finS) continue;
    let cash = EFECTIVO, minCash = EFECTIVO, saltadas = 0;
    for (let i = k; i < ops.length && ops[i].dia < finS; i++) {
      if (cash < colateral * contratos) { saltadas++; continue; }
      cash += ops[i].pl * contratos;
      if (cash < minCash) minCash = cash;
    }
    res.push({ gan: cash - EFECTIVO, minCash, saltadas });
  }
  return res;
}

const CANDIDATAS = [
  { et: "ALA 50 / $100 · 1 contrato  — LA QUE YA OPERA", ala: 50, u: 100, k: 1 },
  { et: "ALA 50 / $50  · 1 contrato  — LA «MEJOR» DEL HALLAZGO", ala: 50, u: 50, k: 1 },
  { et: "ALA 25 / $25  · 2 contratos — puente", ala: 25, u: 25, k: 2 },
  { et: "ALA 20 / $20  · 2 contratos — puente", ala: 20, u: 20, k: 2 },
  { et: "ALA 15 / $15  · 2 contratos — puente", ala: 15, u: 15, k: 2 },
  { et: "ALA 15 / $15  · 3 contratos — puente", ala: 15, u: 15, k: 3 },
];

for (const castigo of [false, true]) {
  console.log("=".repeat(112));
  console.log(`  ${castigo ? "CON MEDIA HORQUILLA MÁS DE PEAJE POR PATA (ejecución peor que el papel)" : "TAL CUAL DICEN LOS PRECIOS DEL BANCO"}`);
  console.log("  Arranque con $7.977 de efectivo · ventanas rodantes de 12 meses · si no hay caja, no se opera");
  console.log("=".repeat(112) + "\n");
  console.log("| candidata | colat. | $/año backtest | 12m mediana | 12m p10 | 12m peor | años en rojo | caja mínima peor | ventanas bloqueadas |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const c of CANDIDATAS) {
    const ops = correr(c.ala, c.u, castigo);
    const col = c.ala * 100;
    if (col * c.k > EFECTIVO) { console.log(`| ${c.et} | ${eur(col * c.k)} | — NO CABE en $7.977 — |`); continue; }
    const v = ventanas(ops, col, c.k);
    const g = v.map((x) => x.gan);
    console.log(`| ${c.et} | ${eur(col * c.k)} | ${eur(suma(ops.map((o) => o.pl)) * c.k / ANOS)} | ${eur(pct(g, 0.5))} | ${eur(pct(g, 0.1))} | ${eur(Math.min(...g))} | ${g.filter((x) => x < 0).length}/${g.length} (${(100 * g.filter((x) => x < 0).length / g.length).toFixed(0)}%) | ${eur(Math.min(...v.map((x) => x.minCash)))} | ${v.filter((x) => x.saltadas > 0).length} |`);
  }
  console.log("");
}
