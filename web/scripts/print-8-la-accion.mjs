// SEGUIR EL PRINT · 8 — ¿Y SI SE MIDE EN LA ACCIÓN, DONDE NO HAY PEAJE?
//
// ═══ POR QUÉ ════════════════════════════════════════════════════════════════════════════════
//
// El efecto medido en la esquina barata es de −3,9% en 5 días. Pero la esquina CUESTA −4,2% en
// esos mismos 5 días sólo de horquilla, así que el neto queda en cero: **el problema no es la
// señal, es el vehículo**.
//
// Y hay una pista de que el efecto es DIRECCIONAL y no un truco de volatilidad: una opción 5%
// fuera a 90 días se mueve unas 3-5 veces lo que el subyacente. Un −3,9% en la opción son ≈1% en
// la acción. Si eso es cierto, en la ACCIÓN el mismo efecto se cobra **sin pagar horquilla**
// (Robinhood: $0 de comisión, ~$0,03 de tasas).
//
// ═══ Y SI ESTO YA SE MIDIÓ Y FALLÓ ══════════════════════════════════════════════════════════
//
// "el lado" contra el retorno de la acción dio t=2,09 con listón 3,34 y se dio por muerto. Pero
// aquello era el lado AGREGADO POR (ticker, día): mezclaba el print de $5M con doscientos de
// $100k, metía dentro el 46,8% de patas de spread, y no restaba el mercado de ese día. Aquí:
//   · UN evento por (ticker, día) = el print MÁS GRANDE, no el promedio
//   · umbral de prima, y la marca de pata de spread
//   · retorno NEUTRAL DE MERCADO: se resta la media de los demás activos de ese mismo día
//   · precio de entrada = CIERRE del día del print (el print es de antes de las 15:00 ET)
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/print-8-la-accion.mjs

import { writeFileSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";
import { cierres, diasDe, tickersConCadena, dias, media, sd, tUna, pctl, fmt, rng, nEfectiva } from "./print-lib.mjs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT, potencia } from "../lib/barreraHallazgos.ts";

const CUENTA = 56389;
const SALIDAS = [1, 3, 5, 10];
const PRIMAS = [0.25e6, 1e6, 2.5e6, 5e6, 10e6];
const LADOS = [1, -1];
const PRUEBAS = LADOS.length * PRIMAS.length * SALIDAS.length;   // 40 pruebas: se declara aquí
const LISTON = listonT(PRUEBAS);
const PERM = 5000;
const ASK = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const BID = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);
const INDICES = new Set(["SPX", "SPXW", "NDX", "RUT", "QQQ", "SPY", "IWM", "SMH", "SOXL", "GLD"]);

// Universo: todo el que tenga CIERRES. No hace falta cadena — aquí se opera la acción.
const universo = tickersConCadena().filter((t) => cierres(t));
const cal = new Map(universo.map((t) => [t, Object.keys(cierres(t)).filter((d) => d >= "20260401").sort()]));
const setCad = new Set(universo);
const tPorDia = (f, c) => { const m = new Map(); for (const x of f) { if (!m.has(x.fechaY)) m.set(x.fechaY, []); m.get(x.fechaY).push(x[c]); } const d = [...m.values()].map(media); return { t: tUna(d), n: d.length, m: media(d) }; };

console.log(`\n${"█".repeat(104)}`);
console.log(`SEGUIR EL PRINT · 8 — el mismo print, medido en la ACCIÓN`);
console.log(`${"█".repeat(104)}`);
console.log(`  ${universo.length} activos con cierres reales · ${PRUEBAS} pruebas declaradas · listón |t| ≥ ${LISTON}\n`);

// ── 1. PRINTS ───────────────────────────────────────────────────────────────────────────────
const eventos = [];
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
    if (!setCad.has(q.raiz)) continue;
    if (!cierres(q.raiz)?.[dY]) continue;
    const et = Number(o.timestamp.slice(11, 13)) - 4 + Number(o.timestamp.slice(14, 16)) / 60;
    if (!(et >= 9.5 && et < 15)) continue;
    const lado = ASK.has(o.side) ? 1 : BID.has(o.side) ? -1 : 0;
    if (lado === 0 || o.premium < PRIMAS[0]) continue;
    eventos.push({ dia, dY, tk: q.raiz, tipo: q.tipo, prem: o.premium, lado, patas: inst.get(k).size, dir: q.tipo === "C" ? 1 : -1, et, dte: dias(dY, q.exp) });
  }
}
console.log(`## ${fmt(eventos.length)} prints candidatos en ${universo.length} activos\n`);

// ── 2. RETORNOS DE LA ACCIÓN, cierre a cierre, y el mercado de cada día ─────────────────────
const retDe = new Map();       // "tk|dY|k" -> retorno de la acción
const porDiaK = new Map();     // k -> Map(dY -> [{tk, r}])
for (const k of SALIDAS) porDiaK.set(k, new Map());
for (const tk of universo) {
  const cl = cierres(tk), ds = cal.get(tk);
  for (let i = 0; i < ds.length; i++) {
    const dY = ds[i], S0 = cl[dY];
    if (!(S0 > 0) || dY < "20260422") continue;
    for (const k of SALIDAS) {
      const j = ds.findIndex((d, x) => x > i && dias(dY, d) >= k);
      if (j < 0) continue;
      const S1 = cl[ds[j]];
      if (!(S1 > 0)) continue;
      const r = S1 / S0 - 1;
      retDe.set(`${tk}|${dY}|${k}`, r);
      const m = porDiaK.get(k);
      if (!m.has(dY)) m.set(dY, []);
      m.get(dY).push({ tk, r });
    }
  }
}
const mercado = new Map();     // "k|dY" -> media de los retornos de ese día
for (const k of SALIDAS) for (const [dY, v] of porDiaK.get(k)) mercado.set(`${k}|${dY}`, media(v.map((x) => x.r)));
console.log(`## retornos de acción calculados: ${fmt(retDe.size)} (activo, día, plazo)\n`);

function construir(lado, minPrem, k, filtro = () => true) {
  const mejor = new Map();
  for (const e of eventos) {
    if (e.lado !== lado || e.prem < minPrem || !filtro(e)) continue;
    const kk = `${e.tk}|${e.dY}`;
    const a = mejor.get(kk);
    if (!a || e.prem > a.prem) mejor.set(kk, e);
  }
  const out = [];
  for (const e of mejor.values()) {
    const r = retDe.get(`${e.tk}|${e.dY}|${k}`);
    const mk = mercado.get(`${k}|${e.dY}`);
    if (r == null || mk == null) continue;
    out.push({
      ticker: e.tk, fechaY: e.dY, fecha: e.dia, dir: e.dir, tipo: e.tipo, prem: e.prem, patas: e.patas, et: e.et,
      bruto: e.dir * r, seguir: e.dir * (r - mk), r, mk,
    });
  }
  return out;
}

// ── 3. LA REJILLA ───────────────────────────────────────────────────────────────────────────
console.log(`${"═".repeat(104)}`);
console.log(`LA ACCIÓN · "neutral" = retorno del activo MENOS el mercado de ese día, en la dirección del print`);
console.log(`${"═".repeat(104)}\n`);
console.log(`  ${"lado".padEnd(4)} ${"prima".padStart(7)} ${"sal".padStart(3)} ${"n".padStart(5)} ${"días".padStart(4)}  ${"neutral".padStart(8)} ${"t DÍA".padStart(6)}  ${"bruto".padStart(7)}  ${"acierto".padStart(7)}  mayor`);
const tabla = [];
for (const lado of LADOS) for (const p of PRIMAS) for (const k of SALIDAS) {
  const f = construir(lado, p, k);
  if (f.length < 60) continue;
  const td = tPorDia(f, "seguir");
  const tks = new Map();
  for (const x of f) tks.set(x.ticker, (tks.get(x.ticker) ?? 0) + 1);
  const may = [...tks.entries()].sort((a, b) => b[1] - a[1])[0];
  console.log(`  ${(lado === 1 ? "ASK" : "BID").padEnd(4)} ${("$" + (p / 1e6).toFixed(2) + "M").padStart(7)} ${String(k).padStart(3)} ${String(f.length).padStart(5)} ${String(td.n).padStart(4)}  ` +
    `${(100 * media(f.map((x) => x.seguir))).toFixed(3).padStart(7)}% ${td.t.toFixed(2).padStart(6)}${Math.abs(td.t) >= LISTON ? "◄" : " "} ${(100 * media(f.map((x) => x.bruto))).toFixed(3).padStart(6)}%  ${(100 * f.filter((x) => x.seguir > 0).length / f.length).toFixed(1).padStart(6)}%  ${may[0]} ${(100 * may[1] / f.length).toFixed(0)}%`);
  tabla.push({ lado, minPrem: p, k, n: f.length, nDias: td.n, neutral: media(f.map((x) => x.seguir)), t: td.t, bruto: media(f.map((x) => x.bruto)), mayor: may[0], mayorPct: may[1] / f.length, filas: f });
}

// ── 4. LA MEJOR, CONTRA LAS CUATRO CRIBAS ───────────────────────────────────────────────────
const mejor = tabla.filter((x) => x.n >= 200).sort((a, b) => Math.abs(b.t) - Math.abs(a.t))[0];
console.log(`\n${"═".repeat(104)}`);
console.log(`LA MÁS FUERTE CONTRA LAS CUATRO CRIBAS`);
console.log(`${"═".repeat(104)}`);
const R = {};
if (mejor) {
  const f = mejor.filas;
  radiografia(f, ["seguir", "bruto", "r", "mk", "prem", "et"], "entradas sobre la acción", { cerosLegitimos: ["seguir", "bruto", "r"] });
  const motivos = [], ok = [];
  if (f.length < 200) motivos.push(`muestra de ${f.length}`); else ok.push(`muestra ${f.length} ≥ 200`);
  if (mejor.mayorPct > 0.2) motivos.push(`${mejor.mayor} es el ${(100 * mejor.mayorPct).toFixed(1)}% (máximo 20%)`);
  else ok.push(`ningún activo pasa del 20% (mayor: ${mejor.mayor} ${(100 * mejor.mayorPct).toFixed(1)}%)`);
  const ord = [...f].sort((a, b) => a.fechaY.localeCompare(b.fechaY));
  const kk = Math.floor(ord.length / 3);
  const ter = [0, 1, 2].map((i) => media((i < 2 ? ord.slice(i * kk, (i + 1) * kk) : ord.slice(2 * kk)).map((x) => x.seguir)));
  if (Math.sign(ter[0]) === Math.sign(ter[1]) && Math.sign(ter[1]) === Math.sign(ter[2])) ok.push(`mismo signo en los tres tercios (${ter.map((x) => (100 * x).toFixed(3) + "%").join(" · ")})`);
  else motivos.push(`el signo NO se repite en los tres tercios (${ter.map((x) => (100 * x).toFixed(3) + "%").join(" · ")})`);
  if (Math.abs(mejor.t) < LISTON) motivos.push(`t por día = ${mejor.t.toFixed(2)}, por debajo del listón de ${LISTON}`);
  else ok.push(`t por día = ${mejor.t.toFixed(2)} ≥ ${LISTON}`);
  console.log(`\n${motivos.length ? "⛔" : "✅"} ACCIÓN · ${mejor.lado === 1 ? "ASK" : "BID"} · ≥$${(mejor.minPrem / 1e6).toFixed(2)}M · ${mejor.k}d — ${motivos.length ? "NO SE PUEDE REPORTAR COMO HALLAZGO" : "PASA LAS CUATRO CRIBAS"}\n`);
  for (const m of motivos) console.log(`  ✗ ${m}`);
  for (const a of ok) console.log(`  ✓ ${a}`);
  const ne = nEfectiva(f, mejor.k);
  console.log(`\n  n=${f.length} en ${mejor.nDias} días · media ${(100 * mejor.neutral).toFixed(3)}% · nEf ${ne.porTicker} · ${ne.ventanas} ventanas`);

  // controles
  console.log(`\n  CONTROLES:`);
  const linea = (n, g) => {
    if (g.length < 50) { console.log(`    ${n.padEnd(38)} n=${String(g.length).padStart(4)} — corta`); return null; }
    const t = tPorDia(g, "seguir");
    console.log(`    ${n.padEnd(38)} n=${String(g.length).padStart(4)}  ${(100 * media(g.map((x) => x.seguir))).toFixed(3).padStart(7)}%  t ${t.t.toFixed(2).padStart(6)}${Math.abs(t.t) >= LISTON ? " ◄" : ""}`);
    return { n: g.length, media: media(g.map((x) => x.seguir)), t: t.t };
  };
  R.acciones = linea("sólo ACCIONES (fuera índices y ETF)", f.filter((x) => !INDICES.has(x.ticker)));
  R.indices = linea("sólo ÍNDICES y ETF", f.filter((x) => INDICES.has(x.ticker)));
  R.sueltos = linea("prints SUELTOS (no pata de spread)", f.filter((x) => x.patas === 1));
  R.patas = linea("prints que SON pata de spread", f.filter((x) => x.patas > 1));
  R.calls = linea("prints de CALL", f.filter((x) => x.tipo === "C"));
  R.puts = linea("prints de PUT", f.filter((x) => x.tipo === "P"));
  R.bid = linea("CONTROL: el mismo print AL BID", construir(-1, mejor.minPrem, mejor.k));

  // permutación
  const azar = rng(20260822);
  const porFecha = new Map();
  for (const x of f) { if (!porFecha.has(x.fechaY)) porFecha.set(x.fechaY, []); porFecha.get(x.fechaY).push(x.dir); }
  const nulos = [];
  for (let it = 0; it < PERM; it++) {
    const md = [];
    for (const [dY, dirs] of porFecha) {
      const cand = porDiaK.get(mejor.k).get(dY);
      if (!cand?.length) continue;
      const mk = mercado.get(`${mejor.k}|${dY}`);
      let s = 0;
      for (const d of dirs) { const x = cand[Math.floor(azar() * cand.length)]; s += d * (x.r - mk); }
      md.push(s / dirs.length);
    }
    nulos.push(media(md));
  }
  const obs = tPorDia(f, "seguir").m, mN = media(nulos), sN = sd(nulos);
  const pv = (nulos.filter((x) => Math.abs(x - mN) >= Math.abs(obs - mN)).length + 1) / (nulos.length + 1);
  console.log(`\n  PERMUTACIÓN (${fmt(PERM)} barajas, activo sorteado del mismo día): observado ${(100 * obs).toFixed(3)}% · nulo ${(100 * mN).toFixed(3)}% ± ${(100 * sN).toFixed(3)}% · z=${((obs - mN) / sN).toFixed(2)} · p=${pv.toFixed(4)}`);
  R.perm = { obs, z: (obs - mN) / sN, p: pv };

  // dinero: la acción se opera sin horquilla apreciable ($0 comisión, ~$0,03 de tasas)
  console.log(`\n  EN DINERO (acción, en corto o largo según el print, ${mejor.k} días, neutralizando el mercado):`);
  const ciclos = 365 / (mejor.k * 1.4);
  for (const cap of [0.1, 0.25]) {
    const capital = CUENTA * cap;
    console.log(`    con $${fmt(capital)} por posición: ${(100 * mejor.neutral).toFixed(3)}% × ${ciclos.toFixed(0)} ciclos/año = $${fmt(capital * mejor.neutral * ciclos)}/año   (SPY: $${fmt(capital * 0.14)})`);
  }
  console.log(`\n  ${potencia(f.map((x) => ({ pnl: x.seguir, ticker: x.ticker, fecha: x.fecha })), 0.003).mensaje}`);
  const faltan = Math.ceil(mejor.nDias * ((LISTON / Math.abs(mejor.t)) ** 2 - 1));
  console.log(`\n  ${Math.abs(mejor.t) >= LISTON ? `YA cruza el listón con ${mejor.nDias} días.` : `Para llegar al listón harían falta ~${faltan} días de mercado MÁS (${(faltan / 21).toFixed(1)} meses).`}`);
  R.mejor = { lado: mejor.lado, minPrem: mejor.minPrem, k: mejor.k, n: f.length, nDias: mejor.nDias, neutral: mejor.neutral, t: mejor.t, tercios: ter, pasa: motivos.length === 0, faltan: Math.abs(mejor.t) >= LISTON ? 0 : faltan };
}

writeFileSync("scripts/print-8-la-accion.json", JSON.stringify({ liston: LISTON, tabla: tabla.map(({ filas, ...x }) => x), R }, null, 1));
console.log(`\n  → scripts/print-8-la-accion.json\n`);
