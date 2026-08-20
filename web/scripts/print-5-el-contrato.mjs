// SEGUIR EL PRINT · 5 — EL CONTRATO QUE ELLOS COMPRARON, CONTRA SUS PROPIOS VECINOS.
//
// ═══ POR QUÉ ESTE CONTROL Y NO OTRO ═════════════════════════════════════════════════════════
//
// El pase 4 dice que comprar exactamente lo que compraron pierde −6,2% en 5 días y sólo gana 1 de
// cada 3 veces. Pero eso solo no vale: comprar CUALQUIER opción pierde dinero. La pregunta es si
// pierde MÁS que sus iguales.
//
// El control es todo lo estrecho que se puede hacer: **los vecinos del propio contrato**, sacados
// de la MISMA cadena del MISMO día:
//     mismo activo · mismo día · mismo tipo (call o put) · vencimiento a ±25% · distancia al
//     dinero a ±3 puntos porcentuales · y el contrato golpeado FUERA de su propio control.
//
// Con eso quedan fuera la dirección del mercado, la deriva del período, el nivel de volatilidad
// del activo, el plazo y la distancia. Lo único que separa al contrato de sus vecinos es que
// **alguien pagó al ask por 2,5 millones de dólares de ÉSE y no de los de al lado**.
//
// ═══ Y LA VERSIÓN QUE LESTER PUEDE EJECUTAR ═════════════════════════════════════════════════
//
// Si el contrato golpeado va peor que sus vecinos, la forma de cobrarlo no es ponerse corto a pelo
// (Robinhood no lo permite y el colateral se lo comería): es VENDER LA VERTICAL de un botón —
// vender el contrato golpeado y comprar el strike de al lado, más fuera del dinero.
// Se mide con precios reales de los dos strikes: crédito = bid(K1) − ask(K2) al entrar,
// coste de cierre = ask(K1) − bid(K2) al salir. Nunca punto medio.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/print-5-el-contrato.mjs

import { writeFileSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";
import {
  cadena, cierres, diasDe, tickersConCadena, bidSalida, limpiarCache,
  dias, media, sd, tUna, pctl, fmt, rng,
} from "./print-lib.mjs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT } from "../lib/barreraHallazgos.ts";

const CUENTA = 56389;
const K_SAL = Number(process.env.K_SAL || 5);
const PRIMAS = [0.25e6, 1e6, 2.5e6, 5e6, 10e6];
const LISTON = listonT(120);
const ASK = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const BID = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);
const INDICES = new Set(["SPX", "SPXW", "NDX", "RUT", "QQQ", "SPY", "IWM", "SMH", "SOXL", "GLD"]);

const conCad = tickersConCadena().filter((t) => cierres(t));
const diasPorTk = new Map(conCad.map((t) => [t, diasDe(t).filter((d) => d >= "20260422")]));
const setDias = new Map(conCad.map((t) => [t, new Set(diasPorTk.get(t))]));
const ULTIMO = [...diasPorTk.values()].flat().sort().pop() ?? "20260806";

console.log(`\n${"═".repeat(106)}`);
console.log(`SEGUIR EL PRINT · 5 — el contrato golpeado contra SUS VECINOS de la misma cadena`);
console.log(`${"═".repeat(106)}`);
console.log(`  ${conCad.length} tickers · cadenas hasta ${ULTIMO} · salida a ${K_SAL} días · listón |t| ≥ ${LISTON}\n`);

const tPorDia = (filas, campo) => {
  const m = new Map();
  for (const f of filas) { if (!m.has(f.fechaY)) m.set(f.fechaY, []); m.get(f.fechaY).push(f[campo]); }
  const d = [...m.values()].map(media);
  return { t: tUna(d), n: d.length, m: media(d) };
};

// ── 1. PRINTS ───────────────────────────────────────────────────────────────────────────────
const eventos = [];
const setCad = new Set(conCad);
for (const dia of diasFlujo("100k")) {
  const crudos = leerDia(dia, "100k");
  if (!crudos.length) continue;
  const inst = new Map(), filas = [];
  for (const o of crudos) {
    const q = parseOCC(o.symbol);
    if (!q) continue;
    const k = `${q.raiz}|${o.timestamp}`;
    if (!inst.has(k)) inst.set(k, new Set());
    inst.get(k).add(`${q.exp}|${q.tipo}|${q.K}`);
    filas.push([o, q, k]);
  }
  const dY = dia.replace(/-/g, "");
  for (const [o, q, k] of filas) {
    if (!setCad.has(q.raiz) || !setDias.get(q.raiz)?.has(dY)) continue;
    const et = Number(o.timestamp.slice(11, 13)) - 4 + Number(o.timestamp.slice(14, 16)) / 60;
    if (!(et >= 9.5 && et < 15)) continue;
    const lado = ASK.has(o.side) ? 1 : BID.has(o.side) ? -1 : 0;
    if (lado === 0 || o.premium < PRIMAS[0]) continue;
    eventos.push({ dia, dY, tk: q.raiz, tipo: q.tipo, K: q.strike, exp: q.exp, prem: o.premium, lado, patas: inst.get(k).size, et, dte: dias(dY, q.exp) });
  }
}
console.log(`## ${fmt(eventos.length)} prints candidatos`);

// ── 2. EL CONTRATO Y SUS VECINOS ────────────────────────────────────────────────────────────
// Un evento por (ticker, día, LADO): el print más grande. Se guarda el ask/bid reales de cierre
// del contrato golpeado, el de sus vecinos, y el de la vertical de un botón.
const porClave = new Map();
for (const e of eventos) {
  const k = `${e.tk}|${e.dY}|${e.lado}`;
  const a = porClave.get(k);
  if (!a || e.prem > a.prem) porClave.set(k, e);
}
console.log(`## ${fmt(porClave.size)} eventos (ticker, día, lado) — el print más grande de cada uno\n`);

const filas = [];
let sinCad = 0, sinPuja = 0, sinSalida = 0, sinPares = 0, sinVert = 0;
const ordenados = [...porClave.values()].sort((a, b) => (a.tk + a.dY).localeCompare(b.tk + b.dY));
let tkActual = null;
for (const e of ordenados) {
  if (e.tk !== tkActual) { limpiarCache(); tkActual = e.tk; }
  const cad = cadena(e.tk, e.dY);
  if (!cad) { sinCad++; continue; }
  const S = cierres(e.tk)?.[e.dY];
  if (!(S > 0)) { sinCad++; continue; }
  const q = cad[e.exp]?.[`${e.K}|${e.tipo}`];
  if (!q || !(q[0] > 0) || !(q[1] > 0)) { sinPuja++; continue; }   // sin puja al cierre no se opera
  const [b0, a0] = q;
  const misDias = diasPorTk.get(e.tk);
  const salida = misDias.find((d) => d > e.dY && dias(e.dY, d) >= K_SAL);
  if (!salida || salida > e.exp) { sinSalida++; continue; }
  const vb = bidSalida(e.tk, salida, e.exp, e.tipo, e.K);
  if (vb === null) { sinSalida++; continue; }
  const ret = vb / a0 - 1;
  const distPrint = e.tipo === "C" ? e.K / S - 1 : 1 - e.K / S;

  // ── LOS VECINOS ──
  const pares = [];
  for (const exp of Object.keys(cad)) {
    const d2 = dias(e.dY, exp);
    if (d2 < 1 || Math.abs(d2 - e.dte) > Math.max(3, e.dte * 0.25)) continue;
    for (const clave of Object.keys(cad[exp])) {
      const [ks, tp] = clave.split("|");
      if (tp !== e.tipo) continue;
      const K2 = Number(ks);
      if (exp === e.exp && K2 === e.K) continue;                    // él no es su propio control
      const dist2 = e.tipo === "C" ? K2 / S - 1 : 1 - K2 / S;
      if (Math.abs(dist2 - distPrint) > 0.03) continue;
      const [bb, aa] = cad[exp][clave];
      if (!(bb > 0) || !(aa > 0)) continue;
      if (exp > salida) { /* vence después de la salida: vale */ } else continue;
      const v2 = bidSalida(e.tk, salida, exp, tp, K2);
      if (v2 === null) continue;
      pares.push(v2 / aa - 1);
    }
  }
  if (pares.length < 3) { sinPares++; continue; }

  // ── LA VERTICAL DE UN BOTÓN: vender K1, comprar el strike de al lado más fuera del dinero ──
  let K2 = null, mejor = Infinity;
  for (const clave of Object.keys(cad[e.exp])) {
    const [ks, tp] = clave.split("|");
    if (tp !== e.tipo) continue;
    const kk = Number(ks);
    const masFuera = e.tipo === "C" ? kk > e.K : kk < e.K;
    if (!masFuera) continue;
    const d = Math.abs(kk - e.K);
    if (d < mejor && cad[e.exp][clave][0] > 0) { mejor = d; K2 = kk; }
  }
  let vert = null;
  if (K2 != null) {
    const [b2, a2] = cad[e.exp][`${K2}|${e.tipo}`];
    const credito = b0 - a2;                                        // vendo al BID, compro al ASK
    const ancho = Math.abs(K2 - e.K);
    if (credito > 0 && ancho > 0) {
      const s1 = cadena(e.tk, salida)?.[e.exp]?.[`${e.K}|${e.tipo}`];
      const s2 = cadena(e.tk, salida)?.[e.exp]?.[`${K2}|${e.tipo}`];
      // al cerrar: recompro la vendida al ASK y vendo la comprada al BID. Sin cotización, vale 0.
      const cierre = (s1 ? s1[1] : 0) - (s2 ? s2[0] : 0);
      const riesgo = ancho - credito;
      if (riesgo > 0) vert = { K2, ancho, credito, cierre, pnl: (credito - cierre) * 100, riesgo: riesgo * 100, rr: (credito - cierre) / riesgo };
    }
  }
  if (!vert) sinVert++;

  filas.push({
    ticker: e.tk, fechaY: e.dY, fecha: e.dia, lado: e.lado, tipo: e.tipo, prem: e.prem, patas: e.patas, et: e.et,
    dte: e.dte, dist: distPrint, ret, retPares: media(pares), nPares: pares.length,
    exceso: ret - media(pares),
    prima: a0 * 100, peaje: (a0 - b0) / a0,
    vertPnl: vert?.pnl ?? null, vertRiesgo: vert?.riesgo ?? null, vertRR: vert?.rr ?? null, vertCredito: vert ? vert.credito * 100 : null,
  });
}
console.log(`   ${fmt(filas.length)} eventos medibles · descartes: ${sinCad} sin cadena/cierre · ${fmt(sinPuja)} sin puja al cierre · ${fmt(sinSalida)} sin salida · ${fmt(sinPares)} sin ≥3 vecinos`);
console.log(`   vecinos por evento: p50 ${pctl(filas.map((f) => f.nPares), 0.5)} · p10 ${pctl(filas.map((f) => f.nPares), 0.1)} · p90 ${pctl(filas.map((f) => f.nPares), 0.9)}`);
radiografia(filas, ["ret", "retPares", "exceso", "prima", "peaje", "dte", "nPares"], "contrato vs vecinos", { cerosLegitimos: ["ret", "retPares", "exceso"] });

// ── 3. EL RESULTADO ─────────────────────────────────────────────────────────────────────────
console.log(`${"═".repeat(106)}`);
console.log(`EL CONTRATO GOLPEADO CONTRA SUS VECINOS · comprar al ASK de cierre, vender al BID a los ${K_SAL} días`);
console.log(`${"═".repeat(106)}\n`);
console.log(`  ${"lado".padEnd(4)} ${"prima".padStart(7)} ${"n".padStart(5)} ${"días".padStart(4)}  ${"contrato".padStart(8)} ${"vecinos".padStart(8)} ${"EXCESO".padStart(7)} ${"t DÍA".padStart(6)}  ${"gana".padStart(5)}  ${"peaje".padStart(5)}  tercios del exceso`);
const res = [];
for (const lado of [1, -1]) for (const p of PRIMAS) {
  const f = filas.filter((x) => x.lado === lado && x.prem >= p);
  if (f.length < 60) continue;
  const td = tPorDia(f, "exceso");
  const ord = [...f].sort((a, b) => a.fechaY.localeCompare(b.fechaY));
  const kk = Math.floor(ord.length / 3);
  const ter = [0, 1, 2].map((i) => media((i < 2 ? ord.slice(i * kk, (i + 1) * kk) : ord.slice(2 * kk)).map((x) => x.exceso)));
  const mismo = Math.sign(ter[0]) === Math.sign(ter[1]) && Math.sign(ter[1]) === Math.sign(ter[2]);
  const tks = new Map();
  for (const x of f) tks.set(x.ticker, (tks.get(x.ticker) ?? 0) + 1);
  const may = [...tks.entries()].sort((a, b) => b[1] - a[1])[0];
  console.log(`  ${(lado === 1 ? "ASK" : "BID").padEnd(4)} ${("$" + (p / 1e6).toFixed(2) + "M").padStart(7)} ${String(f.length).padStart(5)} ${String(td.n).padStart(4)}  ` +
    `${(100 * media(f.map((x) => x.ret))).toFixed(2).padStart(7)}% ${(100 * media(f.map((x) => x.retPares))).toFixed(2).padStart(7)}% ${(100 * media(f.map((x) => x.exceso))).toFixed(2).padStart(6)}% ${td.t.toFixed(2).padStart(6)}${Math.abs(td.t) >= LISTON ? "◄" : " "} ` +
    `${(100 * f.filter((x) => x.exceso > 0).length / f.length).toFixed(1).padStart(5)}% ${(100 * pctl(f.map((x) => x.peaje), 0.5)).toFixed(1).padStart(5)}%  ${ter.map((x) => (100 * x).toFixed(1)).join("/")}${mismo ? " ✓" : " ✗"} ${may[0]} ${(100 * may[1] / f.length).toFixed(0)}%`);
  res.push({ lado, minPrem: p, n: f.length, nDias: td.n, ret: media(f.map((x) => x.ret)), retPares: media(f.map((x) => x.retPares)), exceso: media(f.map((x) => x.exceso)), t: td.t, tercios: ter, mismoSigno: mismo, mayor: { t: may[0], pct: may[1] / f.length } });
}

// ── 4. CORTES ───────────────────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(106)}`);
console.log(`CORTES (todos sobre ASK ≥$2,5M)`);
console.log(`${"═".repeat(106)}\n`);
const base = filas.filter((x) => x.lado === 1 && x.prem >= 2.5e6);
const corte = (nombre, f) => {
  if (f.length < 50) { console.log(`  ${nombre.padEnd(38)} n=${String(f.length).padStart(4)} — muestra corta`); return null; }
  const td = tPorDia(f, "exceso");
  console.log(`  ${nombre.padEnd(38)} n=${String(f.length).padStart(4)}  exceso ${(100 * media(f.map((x) => x.exceso))).toFixed(2).padStart(6)}%  t día ${td.t.toFixed(2).padStart(6)}${Math.abs(td.t) >= LISTON ? " ◄" : ""}`);
  return { n: f.length, exceso: media(f.map((x) => x.exceso)), t: td.t };
};
const cortes = {};
cortes.base = corte("BASE", base);
cortes.sueltos = corte("prints SUELTOS (no pata de spread)", base.filter((x) => x.patas === 1));
cortes.patas = corte("prints que SON pata de spread", base.filter((x) => x.patas > 1));
cortes.acciones = corte("sólo ACCIONES", base.filter((x) => !INDICES.has(x.ticker)));
cortes.indices = corte("sólo ÍNDICES y ETF", base.filter((x) => INDICES.has(x.ticker)));
cortes.calls = corte("contratos CALL", base.filter((x) => x.tipo === "C"));
cortes.puts = corte("contratos PUT", base.filter((x) => x.tipo === "P"));
cortes.corto = corte("plazo del contrato < 60 días", base.filter((x) => x.dte < 60));
cortes.medio = corte("plazo 60-180 días", base.filter((x) => x.dte >= 60 && x.dte < 180));
cortes.largo = corte("plazo ≥ 180 días", base.filter((x) => x.dte >= 180));
cortes.dentro = corte("contrato DENTRO del dinero", base.filter((x) => x.dist < 0));
cortes.fuera = corte("contrato FUERA del dinero", base.filter((x) => x.dist >= 0));
cortes.temprano = corte("print antes de las 12:00 ET", base.filter((x) => x.et < 12));
cortes.tarde = corte("print después de las 12:00 ET", base.filter((x) => x.et >= 12));

// ── 5. LA VERTICAL — lo que Lester puede ejecutar de un botón ───────────────────────────────
console.log(`\n${"═".repeat(106)}`);
console.log(`LA VERTICAL DE UN BOTÓN — vender el contrato golpeado, comprar el strike de al lado`);
console.log(`${"═".repeat(106)}\n`);
console.log(`  crédito = bid(golpeado) − ask(vecino)  ·  cierre a los ${K_SAL} días = ask(golpeado) − bid(vecino)  ·  precios REALES`);
console.log(`\n  ${"lado".padEnd(4)} ${"prima".padStart(7)} ${"n".padStart(5)} ${"crédito".padStart(8)} ${"riesgo".padStart(8)} ${"$/op".padStart(7)} ${"%riesgo".padStart(8)} ${"t DÍA".padStart(6)}  ${"gana".padStart(5)}  ${"ciclos".padStart(6)} ${"$/año 1ctr".padStart(10)}`);
const vert = [];
for (const lado of [1, -1]) for (const p of PRIMAS) {
  const f = filas.filter((x) => x.lado === lado && x.prem >= p && x.vertPnl != null && x.vertRiesgo > 0);
  if (f.length < 60) continue;
  const td = tPorDia(f.map((x) => ({ ...x, v: x.vertPnl })), "v");
  const ciclos = 365 / (K_SAL + 2);
  const dolarOp = media(f.map((x) => x.vertPnl));
  console.log(`  ${(lado === 1 ? "ASK" : "BID").padEnd(4)} ${("$" + (p / 1e6).toFixed(2) + "M").padStart(7)} ${String(f.length).padStart(5)} $${fmt(media(f.map((x) => x.vertCredito))).padStart(7)} $${fmt(media(f.map((x) => x.vertRiesgo))).padStart(7)} $${fmt(dolarOp).padStart(6)} ${(100 * media(f.map((x) => x.vertRR))).toFixed(2).padStart(7)}% ${td.t.toFixed(2).padStart(6)}${Math.abs(td.t) >= LISTON ? "◄" : " "} ${(100 * f.filter((x) => x.vertPnl > 0).length / f.length).toFixed(1).padStart(5)}%  ${ciclos.toFixed(1).padStart(6)} $${fmt(dolarOp * ciclos).padStart(9)}`);
  vert.push({ lado, minPrem: p, n: f.length, credito: media(f.map((x) => x.vertCredito)), riesgo: media(f.map((x) => x.vertRiesgo)), dolarOp, rr: media(f.map((x) => x.vertRR)), t: td.t, gana: f.filter((x) => x.vertPnl > 0).length / f.length, anual1: dolarOp * ciclos });
}

// ── 6. DINERO SOBRE LA CUENTA ───────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(106)}`);
console.log(`EN DÓLARES AL AÑO sobre $${fmt(CUENTA)}`);
console.log(`${"═".repeat(106)}\n`);
{
  const f = filas.filter((x) => x.lado === 1 && x.prem >= 2.5e6 && x.vertPnl != null && x.vertRiesgo > 0);
  if (f.length >= 60) {
    const dolarOp = media(f.map((x) => x.vertPnl)), riesgo = media(f.map((x) => x.vertRiesgo));
    const ciclos = 365 / (K_SAL + 2);
    const oportunidades = f.length / new Set(f.map((x) => x.fechaY)).size;
    for (const cap of [0.1, 0.25]) {
      const n = Math.max(1, Math.floor((CUENTA * cap) / riesgo));
      console.log(`   con el ${(100 * cap).toFixed(0)}% de la cuenta comprometido ($${fmt(CUENTA * cap)} = ${n} verticales a la vez):`);
      console.log(`      $${fmt(dolarOp)} por operación × ${ciclos.toFixed(1)} ciclos/año × ${n} = $${fmt(dolarOp * ciclos * n)}/año   (SPY sobre ese capital: $${fmt(CUENTA * cap * 0.14)})`);
    }
    console.log(`\n   hay ${oportunidades.toFixed(1)} eventos al día de media: sobran candidatos para llenar las plazas.`);
  }
}

writeFileSync("scripts/print-5-el-contrato.json", JSON.stringify({ liston: LISTON, res, cortes, vert }, null, 1));
console.log(`\n  → scripts/print-5-el-contrato.json\n`);
