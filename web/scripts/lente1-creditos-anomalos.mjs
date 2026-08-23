// LENTE 1 (b) — LOS CRÉDITOS QUE NO CABEN EN EL RANGO DE CORDURA
//
// La auditoría de las cuatro patas salió limpia al céntimo, pero destapó 11 operaciones con un
// crédito por encima de $600 (hasta $2.110) en un cóndor cuyas alas sólo miden 50 puntos. El
// crédito máximo teórico de esa estructura son $5.000, así que $2.110 no es imposible — pero
// significaría que el mercado paga el 42% de la anchura por un cóndor a ±45 puntos.
//
// Aquí se abren esas operaciones fila a fila: strikes, bid/ask de las cuatro patas, la horquilla
// de cada una, y cuánto del resultado total sale de esos pocos días. Un crédito inflado por una
// cotización rezagada o por una horquilla absurda es la forma clásica de fabricar dinero en un
// backtest de venta de prima.
//
// Además se mide la sensibilidad del resultado al precio de liquidación: 23 de las 337
// operaciones acaban ENTRE el strike vendido y el comprado, y ahí cada punto de SPX vale $100.
//
// Uso: node --import tsx scripts/lente1-creditos-anomalos.mjs

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { diasDisponibles, cargarDia, rejilla, condor, estructura, hayHora, DIR_CADENA } from "./lib0dte.mjs";

const ANCHO = 45, ALA = 50, COMISION = 0.24, MA_CORTA = 5, MA_LARGA = 50, DIAS_ANO = 244;
const media = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const suma = (v) => v.reduce((a, b) => a + b, 0);

function fila(dia, lado, hhmm, strike) {
  const txt = readFileSync(join(DIR_CADENA, `iv_${dia}_${lado}.csv`), "utf8").split("\n");
  const cab = txt[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid"),
        iA = cab.indexOf("ask"), iU = cab.indexOf("underlying_price");
  for (let n = 1; n < txt.length; n++) {
    const c = txt[n].split(",");
    if (c.length < 5) continue;
    if (c[iT].slice(11, 16) !== hhmm) continue;
    if (+String(c[iK]).replace(/"/g, "") !== strike) continue;
    return { bid: +c[iB], ask: +c[iA], spot: +c[iU] };
  }
  return null;
}

const dias = diasDisponibles();
const R = [];
for (const d of dias) {
  const dia = cargarDia(d);
  if (!dia) continue;
  const ult = dia.barras[dia.barras.length - 1];
  const i = hayHora(dia, "11:00");
  let c = null;
  if (i >= 0) {
    const spot = dia.barras[i].spot, centro = rejilla(spot);
    const patas = condor(centro, ANCHO, ALA);
    const r = estructura(dia, i, "vencimiento", patas);
    if (r) c = { spot, centro, patas, credito: r.credito * 100, dolares: r.dolares - COMISION, riesgo: r.riesgoMax };
  }
  // spot de las 15:55, para ver si el de las 16:00 es una foto viva o repetida
  const j = hayHora(dia, "15:55");
  R.push({ dia: d, cierre: ult.spot, spot1555: j >= 0 ? dia.barras[j].spot : null, c });
}
const cierres = R.map((x) => x.cierre);
for (let i = 0; i < R.length; i++) {
  if (i < MA_LARGA) { R[i].ma50 = null; continue; }
  R[i].ma5 = media(cierres.slice(i - MA_CORTA, i));
  R[i].ma50 = media(cierres.slice(i - MA_LARGA, i));
}
const CONMA = R.filter((x) => x.ma50 != null);
const ANOS = CONMA.length / DIAS_ANO;
const OPS = CONMA.filter((x) => x.c && x.c.spot > x.ma5 && x.c.spot > x.ma50 && x.c.credito >= 50)
                 .map((x) => ({ dia: x.dia, cierre: x.cierre, ...x.c }));
console.log(`n=${OPS.length} · ${(suma(OPS.map((o) => o.dolares)) / ANOS).toFixed(0)} $/año · ${ANOS.toFixed(2)} años\n`);

// ═══ (1) LOS CRÉDITOS ANÓMALOS, FILA A FILA ═════════════════════════════════════════════════
console.log("=".repeat(110));
console.log("  LAS OPERACIONES CON CRÉDITO > $600 — abiertas pata a pata");
console.log("=".repeat(110) + "\n");
const raros = OPS.filter((o) => o.credito > 600).sort((a, b) => b.credito - a.credito);
for (const o of raros) {
  console.log(`── ${o.dia} · spot 11:00 = ${o.spot} · centro ${o.centro} · cierre ${o.cierre} · crédito $${o.credito.toFixed(0)} · P&L $${o.dolares.toFixed(0)}`);
  for (const p of o.patas) {
    const f = fila(o.dia, p.lado, "11:00", p.K);
    const horq = f && f.ask > 0 ? (100 * (f.ask - f.bid) / f.ask).toFixed(0) + "%" : "—";
    console.log(`     ${p.dir === -1 ? "VENDE " : "compra"} ${p.K}${p.lado}  bid=${f.bid}  ask=${f.ask}  horquilla ${horq}  → usa ${p.dir === -1 ? f.bid : f.ask}`);
  }
  console.log("");
}
const totRaros = suma(raros.map((o) => o.dolares));
const tot = suma(OPS.map((o) => o.dolares));
console.log(`  Esas ${raros.length} operaciones aportan $${totRaros.toFixed(0)} de $${tot.toFixed(0)} = ${(100 * totRaros / tot).toFixed(1)}% del total`);
console.log(`  Sin ellas: $${((tot - totRaros) / ANOS).toFixed(0)}/año en vez de $${(tot / ANOS).toFixed(0)}/año\n`);

// ═══ (2) LA HORQUILLA DE LAS PATAS VENDIDAS — ¿es cotización viva o un hueco cotizado? ═══════
console.log("=".repeat(110));
console.log("  LA HORQUILLA DE LAS PATAS QUE SE VENDEN, sobre las 337 operaciones");
console.log("=".repeat(110) + "\n");
const hs = [];
for (const o of OPS)
  for (const p of o.patas.filter((q) => q.dir === -1)) {
    const f = fila(o.dia, p.lado, "11:00", p.K);
    if (f && f.ask > 0) hs.push({ pct: 100 * (f.ask - f.bid) / f.ask, abs: f.ask - f.bid, bid: f.bid, dia: o.dia, K: p.K, lado: p.lado });
  }
hs.sort((a, b) => a.pct - b.pct);
const q = (v, p) => v[Math.floor(p * (v.length - 1))];
console.log(`  n=${hs.length} patas vendidas · horquilla como % del ask:`);
console.log(`    p10 ${q(hs, 0.1).pct.toFixed(0)}% · mediana ${q(hs, 0.5).pct.toFixed(0)}% · p90 ${q(hs, 0.9).pct.toFixed(0)}% · máx ${hs[hs.length - 1].pct.toFixed(0)}%`);
const anchas = hs.filter((h) => h.pct > 50);
console.log(`    patas con horquilla > 50% del ask: ${anchas.length} (${(100 * anchas.length / hs.length).toFixed(1)}%)`);
const bidCero = hs.filter((h) => h.bid === 0);
console.log(`    patas VENDIDAS con bid = 0 (se venden por nada): ${bidCero.length}\n`);

// ═══ (3) SENSIBILIDAD AL PRECIO DE LIQUIDACIÓN ══════════════════════════════════════════════
console.log("=".repeat(110));
console.log("  ¿CUÁNTO CAMBIA EL RESULTADO SI EL PRECIO DE LIQUIDACIÓN SE MUEVE?");
console.log("  SPXW liquida contra el SPX de cierre. Si la foto de las 16:00 del fichero no es");
console.log("  exactamente ese valor, las operaciones que acaban entre strikes cambian $100 por punto.");
console.log("=".repeat(110) + "\n");
for (const dS of [-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3]) {
  let t = 0;
  for (const o of OPS) {
    const S = o.cierre + dS;
    let cierre = 0;
    for (const p of o.patas) {
      const intr = p.lado === "C" ? Math.max(0, S - p.K) : Math.max(0, p.K - S);
      cierre += p.dir === -1 ? intr : -intr;
    }
    t += (o.credito / 100 - cierre) * 100 - COMISION;
  }
  console.log(`  liquidación ${dS >= 0 ? "+" : ""}${dS} puntos → $${(t / ANOS).toFixed(0)}/año  (${dS === 0 ? "el valor del informe" : ((t / ANOS) / (tot / ANOS) * 100 - 100).toFixed(0) + "%"})`);
}

// ═══ (4) ¿LA FOTO DE LAS 16:00 ES VIVA? ═════════════════════════════════════════════════════
console.log("\n" + "=".repeat(110));
console.log("  ¿La barra de las 16:00 trae un precio distinto al de las 15:55, o está repetida?");
console.log("=".repeat(110) + "\n");
const difs = R.filter((x) => x.spot1555 != null).map((x) => Math.abs(x.cierre - x.spot1555));
const iguales = difs.filter((d) => d === 0).length;
difs.sort((a, b) => a - b);
console.log(`  días comparables: ${difs.length} · con spot 16:00 IDÉNTICO al de 15:55: ${iguales}`);
console.log(`  movimiento 15:55→16:00: mediana ${q(difs, 0.5).toFixed(2)} pts · p90 ${q(difs, 0.9).toFixed(2)} pts · máx ${difs[difs.length - 1].toFixed(2)} pts`);
