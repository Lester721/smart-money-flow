// LA REPETICION · 3 — ACUMULACION: el mismo contrato, VARIOS DIAS seguidos.
//
// Los pases 1 y 2 midieron la repetición DENTRO de un día. Sale cero. Pero la forma fuerte de
// "repetir" es otra: alguien que vuelve al MISMO contrato el lunes, el martes y el miércoles.
// Un estallido de un día puede ser una cobertura o un rollo de vencimiento; volver tres días
// seguidos es construir. Y es justo lo que el agregado por (ticker, día) destruía.
//
// LA REGLA:
//   Cuando un contrato acumule >=$X al ASK repartidos en D o más DIAS DISTINTOS dentro de una
//   ventana de 5 sesiones, compra al cierre del último de esos días —el propio contrato, o la
//   esquina barata en su dirección— y vende a los 5 días.
//
// EL CONTROL QUE MANDA EL ENCARGO: la MISMA prima total metida en UN SOLO día. Si acumular no
// bate a la misma prima de golpe, "repetir" no aporta nada y sólo hay tamaño.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/rep-3-acumulacion.mjs

import { writeFileSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";
import {
  cadena, cierres, diasDe, tickersConCadena, elegirEsquina, limpiarCache,
  dias, media, sd, tUna, pctl, fmt, rng, nEfectiva,
} from "./print-lib.mjs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT } from "../lib/barreraHallazgos.ts";

const CUENTA = 56389;
const SALIDA = 5;
const VENTANA = 5;                   // sesiones hacia atrás que forman la ventana de acumulación
const MIN_DIA = 5e5;                 // un día "cuenta" si mete al menos esto al ask
const PRUEBAS = 120;
const LISTON = listonT(PRUEBAS);
const SORTEOS = 500;
const DIST = 0.05, DTE_OBJ = 90, TOL_DTE = 25;
const TOL_DTE_GEM = 15, TOL_MNY = 0.02, TOL_HORQ = 0.25;

const ASK = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const BID = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);
const MULTI = new Set([232, 233, 234, 235, 236, 238, 239, 246, 247]);
const BASURA = new Set([201, 202, 203, 204, 205, 206, 207, 208, 248]);
const ACCOPC = new Set([237, 240, 241, 242, 243, 244, 245]);
const INDICES = new Set(["SPX", "SPXW", "NDX", "RUT", "QQQ", "SPY", "IWM", "SMH", "GLD"]);

const conCad = tickersConCadena().filter((t) => cierres(t));
const setCad = new Set(conCad);
const diasPorTk = new Map(conCad.map((t) => [t, diasDe(t).filter((d) => d >= "20260422")]));
const setDias = new Map(conCad.map((t) => [t, new Set(diasPorTk.get(t))]));
const ULTIMO = [...diasPorTk.values()].flat().sort().pop();

const tPorDia = (f, c) => {
  const m = new Map();
  for (const x of f) { if (!m.has(x.fechaY)) m.set(x.fechaY, []); m.get(x.fechaY).push(x[c]); }
  const d = [...m.values()].map(media);
  return { t: tUna(d), nDias: d.length, m: media(d) };
};
const tercios = (f, c) => {
  const o = [...f].sort((a, b) => a.fechaY.localeCompare(b.fechaY));
  const k = Math.floor(o.length / 3);
  if (k < 3) return null;
  return [0, 1, 2].map((i) => media((i < 2 ? o.slice(i * k, (i + 1) * k) : o.slice(2 * k)).map((x) => x[c])));
};
const okSigno = (t) => !!t && Math.sign(t[0]) === Math.sign(t[1]) && Math.sign(t[1]) === Math.sign(t[2]);

console.log(`\n${"#".repeat(104)}`);
console.log(`LA REPETICION · 3 — ACUMULACION a lo largo de DIAS`);
console.log(`${"#".repeat(104)}`);
console.log(`  ventana de ${VENTANA} sesiones · un día cuenta si mete >=$${fmt(MIN_DIA / 1000)}k al ask · listón |t| >= ${LISTON}\n`);

// ── 1. SERIE DIARIA POR CONTRATO ────────────────────────────────────────────────────────────
const serie = new Map();                 // symbol -> Map(dY -> {ask, bid, nAsk, oi})
const meta = new Map();                  // symbol -> {tk, exp, tipo, K}
const diasF = diasFlujo("100k");
for (const dia of diasF) {
  const crudos = leerDia(dia, "100k");
  if (!crudos.length) continue;
  const dY = dia.replace(/-/g, "");
  const g = new Map();
  for (const o of crudos) {
    const cid = o.trade_condition_id;
    if (BASURA.has(cid) || ACCOPC.has(cid) || MULTI.has(cid)) continue;
    const q = parseOCC(o.symbol);
    if (!q || !setCad.has(q.raiz) || !setDias.get(q.raiz)?.has(dY)) continue;
    const lado = ASK.has(o.side) ? 1 : BID.has(o.side) ? -1 : 0;
    if (lado === 0) continue;
    const et = Number(o.timestamp.slice(11, 13)) - 4 + Number(o.timestamp.slice(14, 16)) / 60;
    if (!(et >= 9.5 && et < 15)) continue;
    let a = g.get(o.symbol);
    if (!a) { a = { ask: 0, bid: 0, nAsk: 0, oi: o.open_interest }; g.set(o.symbol, a); }
    if (lado === 1) { a.ask += o.premium; a.nAsk++; } else a.bid += o.premium;
    if (o.open_interest < a.oi) a.oi = o.open_interest;   // el OI del día es el de su apertura
    if (!meta.has(o.symbol)) meta.set(o.symbol, { tk: q.raiz, exp: q.exp, tipo: q.tipo, K: q.strike });
  }
  for (const [sym, a] of g) {
    if (a.ask + a.bid < 2.5e5) continue;                  // ruido: fuera, para que quepa en memoria
    if (!serie.has(sym)) serie.set(sym, new Map());
    serie.get(sym).set(dY, a);
  }
}
console.log(`  contratos con al menos un día de >=$250k: ${fmt(serie.size)}`);

// ── 2. EVENTOS DE ACUMULACION ───────────────────────────────────────────────────────────────
// El calendario de sesiones: los días de flujo, que son días de mercado.
const calF = diasF.map((d) => d.replace(/-/g, ""));
const idxCal = new Map(calF.map((d, i) => [d, i]));

const eventos = [];
for (const [sym, m] of serie) {
  const mm = meta.get(sym);
  const ds = [...m.keys()].sort();
  for (const d of ds) {
    const i = idxCal.get(d);
    if (i == null) continue;
    const desde = calF[Math.max(0, i - VENTANA + 1)];
    let ask = 0, bid = 0, diasAct = 0, nAsk = 0, oiIni = null, oiFin = null, primerDia = null;
    for (const [dd, a] of m) {
      if (dd < desde || dd > d) continue;
      ask += a.ask; bid += a.bid; nAsk += a.nAsk;
      if (a.ask >= MIN_DIA) { diasAct++; if (!primerDia) primerDia = dd; }
      if (oiIni == null) oiIni = a.oi;
      oiFin = a.oi;
    }
    if (m.get(d).ask < MIN_DIA) continue;                 // el ÚLTIMO día tiene que ser activo
    if (ask < 1e6) continue;
    eventos.push({
      sym, tk: mm.tk, exp: mm.exp, tipo: mm.tipo, K: mm.K, dY: d,
      ask, bid, diasAct, nAsk, oiIni, oiFin,
      dOI: oiIni > 0 && oiFin != null ? oiFin / oiIni - 1 : null,
      sesionesSpan: primerDia ? idxCal.get(d) - idxCal.get(primerDia) + 1 : 1,
    });
  }
}
console.log(`  eventos (contrato, día) con >=$1M al ask en la ventana: ${fmt(eventos.length)}`);
{
  const h = new Map();
  for (const e of eventos) h.set(e.diasAct, (h.get(e.diasAct) ?? 0) + 1);
  console.log(`  reparto por DIAS ACTIVOS en la ventana: ${[...h.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}d:${fmt(v)}`).join(" · ")}`);
}

// ── 3. PRECIOS REALES: contrato + gemelos + esquina barata ──────────────────────────────────
const porTk = new Map();
for (const e of eventos) { if (!porTk.has(e.tk)) porTk.set(e.tk, []); porTk.get(e.tk).push(e); }

const filas = [];
let sinEnt = 0, sinGem = 0, conPuja = 0, sinPuja = 0;
for (const [tk, lista] of porTk) {
  limpiarCache();
  const md = diasPorTk.get(tk), cl = cierres(tk);
  const porDia = new Map();
  for (const e of lista) { if (!porDia.has(e.dY)) porDia.set(e.dY, []); porDia.get(e.dY).push(e); }
  for (const [dY, es] of porDia) {
    if (dY > ULTIMO) continue;
    const S = cl?.[dY];
    if (!(S > 0)) continue;
    const cad = cadena(tk, dY);
    if (!cad) continue;
    const dSal = md.find((d) => d > dY && dias(dY, d) >= SALIDA);
    if (!dSal) continue;
    const cadSal = cadena(tk, dSal);
    if (!cadSal) continue;

    const univ = [];
    for (const exp of Object.keys(cad)) {
      const dte = dias(dY, exp);
      if (dte < 1 || exp <= dSal) continue;
      for (const clave of Object.keys(cad[exp])) {
        const [ks, tipo] = clave.split("|");
        const K = Number(ks);
        const [bid, aa] = cad[exp][clave];
        if (!(aa > 0) || !(bid > 0)) continue;
        const q = cadSal[exp]?.[clave];
        univ.push({ exp, K, tipo, dte, mny: tipo === "C" ? K / S - 1 : 1 - K / S, ask: aa, horq: (aa - bid) / aa, ret: (q ? q[0] : 0) / aa - 1, hayPuja: !!q });
      }
    }
    if (!univ.length) continue;
    const idx = new Map(univ.map((u) => [`${u.exp}|${u.K}|${u.tipo}`, u]));

    // esquina barata del día (el otro vehículo)
    const cC = elegirEsquina(cad, S, DTE_OBJ, DIST, "C", dY, TOL_DTE);
    const cP = elegirEsquina(cad, S, DTE_OBJ, DIST, "P", dY, TOL_DTE);
    let esq = null;
    if (cC && cP && cC.exp === cP.exp && cC.exp > dSal) {
      const qC = cadSal[cC.exp]?.[`${cC.K}|C`], qP = cadSal[cP.exp]?.[`${cP.K}|P`];
      const rC = (qC ? qC[0] : 0) / cC.ask - 1, rP = (qP ? qP[0] : 0) / cP.ask - 1;
      esq = { g: (rC - rP) / 2, C: rC, P: rP, askC: cC.ask * 100, askP: cP.ask * 100 };
    }

    for (const e of es) {
      const yo = idx.get(`${e.exp}|${e.K}|${e.tipo}`);
      if (!yo) { sinEnt++; continue; }
      if (yo.hayPuja) conPuja++; else sinPuja++;
      const gem = univ.filter((u) => u !== yo && u.tipo === yo.tipo
        && Math.abs(u.dte - yo.dte) <= TOL_DTE_GEM
        && Math.abs(u.mny - yo.mny) <= TOL_MNY
        && Math.abs(u.horq - yo.horq) <= TOL_HORQ * yo.horq);
      if (gem.length < 3) { sinGem++; continue; }
      const dir = e.tipo === "C" ? 1 : -1;
      filas.push({
        ticker: tk, fechaY: dY, fecha: `${dY.slice(0, 4)}-${dY.slice(4, 6)}-${dY.slice(6, 8)}`,
        sym: e.sym, tipo: e.tipo, dir, diasAct: e.diasAct, ask: e.ask, bid: e.bid, nAsk: e.nAsk,
        dOI: e.dOI, dte: yo.dte, mny: yo.mny, horq: yo.horq, horqGem: media(gem.map((g) => g.horq)),
        prima: yo.ask * 100, nGem: gem.length,
        ret: yo.ret, retGem: media(gem.map((g) => g.ret)), exceso: yo.ret - media(gem.map((g) => g.ret)),
        esqSeguir: esq ? dir * esq.g : null,
        esqRet: esq ? (dir === 1 ? esq.C : esq.P) : null,
        esqPrima: esq ? (dir === 1 ? esq.askC : esq.askP) : null,
        diasPos: dias(dY, dSal),
      });
    }
  }
}
console.log(`  medidos ${fmt(filas.length)} eventos con contrato en cadena y >=3 gemelos (${fmt(sinEnt)} sin cotización, ${fmt(sinGem)} sin gemelos)`);
console.log(`  salidas con puja real: ${((100 * conPuja) / (conPuja + sinPuja)).toFixed(2)}%\n`);

radiografia(filas, ["ret", "retGem", "exceso", "horq", "horqGem", "prima", "diasAct", "ask", "dte"],
  "eventos de acumulación", { cerosLegitimos: ["ret", "retGem", "exceso"] });

const linea = (nombre, f, campo = "exceso") => {
  const g = f.filter((x) => x[campo] != null);
  if (g.length < 40) { console.log(`  ${nombre.padEnd(44)} n=${String(g.length).padStart(5)}  — muestra corta`); return null; }
  const td = tPorDia(g, campo), te = tercios(g, campo);
  const ne = nEfectiva(g, SALIDA);
  const m = media(g.map((x) => x[campo]));
  console.log(`  ${nombre.padEnd(44)} n=${String(g.length).padStart(5)} ${String(td.nDias).padStart(3)}d nef=${String(ne.porTicker).padStart(4)} ${(100 * m).toFixed(2).padStart(7)}%  t ${td.t.toFixed(2).padStart(6)}${Math.abs(td.t) >= LISTON ? " <<" : "   "} tercios ${te ? te.map((x) => (100 * x).toFixed(1)).join("/") : "-"}${okSigno(te) ? " ok" : " x"}`);
  return { nombre, n: g.length, nDias: td.nDias, nEfectiva: ne.porTicker, ventanas: ne.ventanas, media: m, t: td.t, tercios: te, mismoSigno: okSigno(te), cruza: Math.abs(td.t) >= LISTON };
};

console.log(`${"=".repeat(104)}`);
console.log(`1. LA TRAMPA DE LA HORQUILLA, otra vez, antes de nada`);
console.log(`${"=".repeat(104)}\n`);
{
  const a = filas.filter((f) => f.diasAct >= 2 && f.ask >= 2.5e6);
  if (a.length) {
    console.log(`   horquilla del contrato acumulado: ${(100 * media(a.map((f) => f.horq))).toFixed(2)}%  ·  gemelos ${(100 * media(a.map((f) => f.horqGem))).toFixed(2)}%  ·  diferencia ${(100 * media(a.map((f) => f.horq - f.horqGem))).toFixed(2)} puntos`);
  }
}

console.log(`\n${"=".repeat(104)}`);
console.log(`2. ACUMULAR EN VARIOS DIAS contra METERLO TODO EN UNO — el control del encargo`);
console.log(`${"=".repeat(104)}\n`);
console.log(`  A) el propio contrato, EXCESO sobre sus gemelos de horquilla:\n`);
const escA = [], escB = [];
for (const X of [1e6, 2.5e6, 5e6]) {
  console.log(`   --- prima acumulada al ask >=$${(X / 1e6).toFixed(1)}M ---`);
  for (const [lo, hi, et] of [[1, 1, "TODO EN UN DIA"], [2, 2, "en 2 días"], [3, 5, "en 3-5 días"]]) {
    const r = linea(`     ${et}`, filas.filter((f) => f.diasAct >= lo && f.diasAct <= hi && f.ask >= X));
    if (r) escA.push({ ...r, lo, hi, X });
  }
}
console.log(`\n  B) la ESQUINA BARATA en la dirección de la acumulación (el vehículo con peaje del 5%):\n`);
for (const X of [1e6, 2.5e6, 5e6]) {
  console.log(`   --- prima acumulada al ask >=$${(X / 1e6).toFixed(1)}M ---`);
  for (const [lo, hi, et] of [[1, 1, "TODO EN UN DIA"], [2, 2, "en 2 días"], [3, 5, "en 3-5 días"]]) {
    const r = linea(`     ${et}`, filas.filter((f) => f.diasAct >= lo && f.diasAct <= hi && f.ask >= X), "esqSeguir");
    if (r) escB.push({ ...r, lo, hi, X });
  }
}

console.log(`\n${"=".repeat(104)}`);
console.log(`3. ¿Y SI ADEMAS EL OI SUBE? — la alerta "accumulation" de MarketSnack, con su criterio`);
console.log(`${"=".repeat(104)}\n`);
const oiOut = [];
{
  const base = filas.filter((f) => f.diasAct >= 2 && f.ask >= 1e6 && f.dOI != null);
  console.log(`   eventos de acumulación (>=2 días, >=$1M) con OI medible: ${base.length}`);
  if (base.length) {
    console.log(`   ΔOI en la ventana — p10 ${(100 * pctl(base.map((f) => f.dOI), 0.1)).toFixed(1)}% · mediana ${(100 * pctl(base.map((f) => f.dOI), 0.5)).toFixed(1)}% · p90 ${(100 * pctl(base.map((f) => f.dOI), 0.9)).toFixed(1)}%\n`);
    for (const [lo, hi, et] of [[-9, 0, "OI BAJA (cierran posiciones)"], [0, 0.2, "OI sube <20%"], [0.2, 9, "OI sube >=20% (la alerta)"]]) {
      const r = linea(`     ${et}`, base.filter((f) => f.dOI >= lo && f.dOI < hi));
      if (r) oiOut.push({ ...r, lo, hi, campo: "exceso" });
      const r2 = linea(`     ${et} · esquina barata`, base.filter((f) => f.dOI >= lo && f.dOI < hi), "esqSeguir");
      if (r2) oiOut.push({ ...r2, lo, hi, campo: "esqSeguir" });
    }
  }
}

console.log(`\n${"=".repeat(104)}`);
console.log(`4. CONTROLES sobre acumulación >=2 días · >=$2,5M`);
console.log(`${"=".repeat(104)}\n`);
const base = filas.filter((f) => f.diasAct >= 2 && f.ask >= 2.5e6);
const C = {};
C.base = linea("BASE (exceso sobre gemelos)", base);
C.baseEsq = linea("BASE (esquina barata en su dirección)", base, "esqSeguir");
C.masAskQueBid = linea("además el ask DOBLA al bid del contrato", base.filter((f) => f.ask > 2 * f.bid));
C.calls = linea("sólo CALL", base.filter((f) => f.tipo === "C"));
C.puts = linea("sólo PUT", base.filter((f) => f.tipo === "P"));
C.acciones = linea("sólo ACCIONES", base.filter((f) => !INDICES.has(f.ticker)));
C.indices = linea("sólo INDICES y ETF", base.filter((f) => INDICES.has(f.ticker)));
C.largo = linea("plazo LARGO (>=60d)", base.filter((f) => f.dte >= 60));
C.lejos = linea("contrato LEJOS del dinero (>=10%)", base.filter((f) => f.mny >= 0.10));

console.log(`\n${"=".repeat(104)}`);
console.log(`5. CONCENTRACION Y ACTIVO A ACTIVO`);
console.log(`${"=".repeat(104)}\n`);
{
  const c = new Map();
  for (const f of base) c.set(f.ticker, (c.get(f.ticker) ?? 0) + 1);
  const top = [...c.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`   ${base.length} eventos en ${c.size} activos · mayor: ${top[0]?.[0]} ${((100 * (top[0]?.[1] ?? 0)) / base.length).toFixed(1)}%`);
  console.log(`   ${top.slice(0, 8).map(([t, n]) => `${t} ${n}`).join(" · ")}`);
  const fu = [];
  for (const [t, n] of top) if (n >= 15) { const f = base.filter((x) => x.ticker !== t); fu.push({ t, tt: tPorDia(f, "exceso").t }); }
  fu.sort((a, b) => Math.abs(a.tt) - Math.abs(b.tt));
  if (fu.length) console.log(`   dejando fuera uno cada vez, |t| va de ${Math.abs(fu[0].tt).toFixed(2)} (sin ${fu[0].t}) a ${Math.abs(fu[fu.length - 1].tt).toFixed(2)} (sin ${fu[fu.length - 1].t}) — cruza el listón en ${fu.filter((x) => Math.abs(x.tt) >= LISTON).length}/${fu.length}`);
}

console.log(`\n${"=".repeat(104)}`);
console.log(`6. EN DOLARES AL AÑO sobre $${fmt(CUENTA)}`);
console.log(`${"=".repeat(104)}\n`);
const dinero = [];
for (const [nombre, f, campo, campoPrima] of [
  ["acumulación >=2d · el contrato", base, "ret", "prima"],
  ["  su gemelo sorteado (azar)", base, "retGem", "prima"],
  ["todo en 1 día · el contrato", filas.filter((x) => x.diasAct === 1 && x.ask >= 2.5e6), "ret", "prima"],
  ["acumulación >=2d · esquina barata", base.filter((x) => x.esqRet != null), "esqRet", "esqPrima"],
]) {
  if (f.length < 40) continue;
  const prima = media(f.map((x) => x[campoPrima]));
  const m = media(f.map((x) => x[campo]));
  const diasPos = media(f.map((x) => x.diasPos));
  const nCtr = Math.max(1, Math.floor((CUENTA * 0.1) / prima));
  const anual = nCtr * prima * m * (365 / diasPos);
  const ac = (100 * f.filter((x) => x[campo] > 0).length) / f.length;
  console.log(`  ${nombre.padEnd(36)} ${String(f.length).padStart(4)} ops · prima $${fmt(prima).padStart(6)} · ${nCtr} ctr = $${fmt(nCtr * prima).padStart(6)} · ${(100 * m).toFixed(2).padStart(7)}%/op · acierto ${ac.toFixed(1)}% · ${("$" + fmt(anual)).padStart(9)}/año`);
  dinero.push({ nombre, n: f.length, prima, nCtr, comprometido: nCtr * prima, media: m, anual, acierto: ac, diasPos });
}

writeFileSync("scripts/rep-3-acumulacion.json", JSON.stringify({ LISTON, escA, escB, oiOut, C, dinero }, null, 1));
console.log(`\n  -> scripts/rep-3-acumulacion.json\n`);
