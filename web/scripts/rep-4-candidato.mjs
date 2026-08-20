// LA REPETICION · 4 — EL UNICO CANDIDATO, CONTRA LA PARED.
//
// Del pase 3 salió UNA celda cruzando el listón: acumulación en >=2 días, >=$2,5M al ask, en un
// contrato a >=10% del dinero → +0,76% sobre sus gemelos, t=3,79, mismo signo en los tres tercios.
//
// Una celda entre cincuenta es exactamente lo que produce el azar. Antes de llamarlo nada hay que
// intentar matarlo, y el orden importa:
//   1. ¿es la horquilla otra vez? (la trampa del 16 ago)
//   2. ¿aparece igual SIN acumulación? — si todo contrato lejano del flujo bate a sus gemelos,
//      la repetición no pinta nada y el hallazgo es de otra cosa
//   3. ¿aparece igual AL BID? — si comprar y vender dan lo mismo, no es dirección
//   4. ¿aparece el día ANTES? — si sí, no lo causa el racimo
//   5. ¿es monótono en distancia y en días? — un efecto real tiene forma; el ruido, no
//   6. ¿vive en un activo o en cuatro operaciones?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/rep-4-candidato.mjs

import { writeFileSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";
import {
  cadena, cierres, diasDe, tickersConCadena, limpiarCache,
  dias, media, sd, tUna, pctl, fmt, rng, nEfectiva,
} from "./print-lib.mjs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT } from "../lib/barreraHallazgos.ts";

const CUENTA = 56389;
const SALIDAS = [3, 5, 10];
const VENTANA = 5, MIN_DIA = 5e5;
const PRUEBAS = 120;
const LISTON = listonT(PRUEBAS);
const SORTEOS = 500;
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

console.log(`\n${"#".repeat(108)}`);
console.log(`LA REPETICION · 4 — el candidato contra la pared`);
console.log(`${"#".repeat(108)}`);
console.log(`  listón |t| >= ${LISTON}\n`);

// ── 1. SERIE DIARIA POR CONTRATO, LOS DOS LADOS ─────────────────────────────────────────────
const serie = new Map();
const meta = new Map();
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
    if (!a) { a = { ask: 0, bid: 0 }; g.set(o.symbol, a); }
    if (lado === 1) a.ask += o.premium; else a.bid += o.premium;
    if (!meta.has(o.symbol)) meta.set(o.symbol, { tk: q.raiz, exp: q.exp, tipo: q.tipo, K: q.strike });
  }
  for (const [sym, a] of g) {
    if (a.ask + a.bid < 2.5e5) continue;
    if (!serie.has(sym)) serie.set(sym, new Map());
    serie.get(sym).set(dY, a);
  }
}
const calF = diasF.map((d) => d.replace(/-/g, ""));
const idxCal = new Map(calF.map((d, i) => [d, i]));

/** Eventos de acumulación por lado. lado=1 al ask, lado=-1 al bid (el placebo). */
function eventosDe(lado) {
  const out = [];
  const campo = lado === 1 ? "ask" : "bid";
  for (const [sym, m] of serie) {
    const mm = meta.get(sym);
    for (const [d, hoy] of m) {
      if (hoy[campo] < MIN_DIA) continue;
      const i = idxCal.get(d);
      if (i == null) continue;
      const desde = calF[Math.max(0, i - VENTANA + 1)];
      let tot = 0, diasAct = 0, otro = 0;
      for (const [dd, a] of m) {
        if (dd < desde || dd > d) continue;
        tot += a[campo]; otro += a[lado === 1 ? "bid" : "ask"];
        if (a[campo] >= MIN_DIA) diasAct++;
      }
      if (tot < 1e6) continue;
      out.push({ sym, tk: mm.tk, exp: mm.exp, tipo: mm.tipo, K: mm.K, dY: d, tot, otro, diasAct, lado });
    }
  }
  return out;
}
const evAsk = eventosDe(1), evBid = eventosDe(-1);
console.log(`  eventos: ${fmt(evAsk.length)} al ask · ${fmt(evBid.length)} al bid (placebo)\n`);

// ── 2. PRECIOS REALES + GEMELOS, para las tres salidas y para el día ANTES ──────────────────
const porTk = new Map();
for (const e of [...evAsk, ...evBid]) { if (!porTk.has(e.tk)) porTk.set(e.tk, []); porTk.get(e.tk).push(e); }

const filas = [];
for (const [tk, lista] of porTk) {
  limpiarCache();
  const md = diasPorTk.get(tk), cl = cierres(tk);
  const porDia = new Map();
  for (const e of lista) { if (!porDia.has(e.dY)) porDia.set(e.dY, []); porDia.get(e.dY).push(e); }
  // días de entrada necesarios: el del evento y el ANTERIOR de mercado
  for (const [dY, es] of porDia) {
    if (dY > ULTIMO) continue;
    const iMd = md.indexOf(dY);
    if (iMd < 1) continue;
    for (const [etiqueta, dEnt] of [["hoy", dY], ["antes", md[iMd - 1]]]) {
      const S = cl?.[dEnt];
      if (!(S > 0)) continue;
      const cad = cadena(tk, dEnt);
      if (!cad) continue;
      const salPorK = {};
      for (const K of SALIDAS) {
        const s = md.find((d) => d > dEnt && dias(dEnt, d) >= K);
        if (s) salPorK[K] = { dia: s, cad: cadena(tk, s) };
      }
      if (!salPorK[5]?.cad) continue;

      const univ = [];
      for (const exp of Object.keys(cad)) {
        const dte = dias(dEnt, exp);
        if (dte < 1 || exp <= salPorK[5].dia) continue;
        for (const clave of Object.keys(cad[exp])) {
          const [ks, tipo] = clave.split("|");
          const K = Number(ks);
          const [bid, aa] = cad[exp][clave];
          if (!(aa > 0) || !(bid > 0)) continue;
          const u = { exp, K, tipo, dte, mny: tipo === "C" ? K / S - 1 : 1 - K / S, ask: aa, horq: (aa - bid) / aa, r: {} };
          for (const KK of SALIDAS) {
            const s = salPorK[KK];
            if (!s?.cad || s.dia >= exp) continue;
            const q = s.cad[exp]?.[clave];
            u.r[KK] = (q ? q[0] : 0) / aa - 1;
          }
          univ.push(u);
        }
      }
      if (!univ.length) continue;
      const idx = new Map(univ.map((u) => [`${u.exp}|${u.K}|${u.tipo}`, u]));
      for (const e of es) {
        const yo = idx.get(`${e.exp}|${e.K}|${e.tipo}`);
        if (!yo || yo.r[5] == null) continue;
        const gem = univ.filter((u) => u !== yo && u.tipo === yo.tipo && u.r[5] != null
          && Math.abs(u.dte - yo.dte) <= TOL_DTE_GEM
          && Math.abs(u.mny - yo.mny) <= TOL_MNY
          && Math.abs(u.horq - yo.horq) <= TOL_HORQ * yo.horq);
        if (gem.length < 3) continue;
        const f = {
          ticker: tk, fechaY: dEnt, fecha: `${dEnt.slice(0, 4)}-${dEnt.slice(4, 6)}-${dEnt.slice(6, 8)}`,
          cuando: etiqueta, lado: e.lado, sym: e.sym, tipo: e.tipo, diasAct: e.diasAct, tot: e.tot, otro: e.otro,
          dte: yo.dte, mny: yo.mny, horq: yo.horq, horqGem: media(gem.map((g) => g.horq)),
          prima: yo.ask * 100, nGem: gem.length,
          diasPos: dias(dEnt, salPorK[5].dia),
        };
        for (const KK of SALIDAS) {
          const g2 = gem.filter((g) => g.r[KK] != null);
          f[`ret${KK}`] = yo.r[KK] ?? null;
          f[`gem${KK}`] = g2.length >= 3 ? media(g2.map((g) => g.r[KK])) : null;
          f[`exc${KK}`] = f[`ret${KK}`] != null && f[`gem${KK}`] != null ? f[`ret${KK}`] - f[`gem${KK}`] : null;
        }
        filas.push(f);
      }
    }
  }
}
const hoyAsk = filas.filter((f) => f.cuando === "hoy" && f.lado === 1);
console.log(`  medidos ${fmt(filas.length)} (evento, momento de entrada) · al ask y de hoy: ${fmt(hoyAsk.length)}\n`);
radiografia(hoyAsk, ["exc5", "ret5", "gem5", "horq", "horqGem", "mny", "prima", "diasAct"],
  "eventos al ask, entrada el mismo día", { cerosLegitimos: ["exc5", "ret5", "gem5"] });

const linea = (nombre, f, campo = "exc5") => {
  const g = f.filter((x) => x[campo] != null);
  if (g.length < 40) { console.log(`  ${nombre.padEnd(50)} n=${String(g.length).padStart(5)}  — muestra corta`); return null; }
  const td = tPorDia(g, campo), te = tercios(g, campo);
  const ne = nEfectiva(g, 5);
  const m = media(g.map((x) => x[campo]));
  console.log(`  ${nombre.padEnd(50)} n=${String(g.length).padStart(5)} ${String(td.nDias).padStart(3)}d nef=${String(ne.porTicker).padStart(4)} ${(100 * m).toFixed(2).padStart(7)}%  t ${td.t.toFixed(2).padStart(6)}${Math.abs(td.t) >= LISTON ? " <<" : "   "} tercios ${te ? te.map((x) => (100 * x).toFixed(1)).join("/") : "-"}${okSigno(te) ? " ok" : " x"}`);
  return { nombre, n: g.length, nDias: td.nDias, nEfectiva: ne.porTicker, ventanas: ne.ventanas, media: m, t: td.t, tercios: te, mismoSigno: okSigno(te), cruza: Math.abs(td.t) >= LISTON };
};

const CAND = (f) => f.diasAct >= 2 && f.tot >= 2.5e6 && f.mny >= 0.10;

// ── 3. ATAQUE 1: LA HORQUILLA ───────────────────────────────────────────────────────────────
console.log(`${"=".repeat(108)}`);
console.log(`ATAQUE 1 — ¿es la horquilla otra vez?`);
console.log(`${"=".repeat(108)}\n`);
const cand = hoyAsk.filter(CAND);
console.log(`   el candidato: acumulación >=2 días · >=$2,5M · contrato a >=10% del dinero · n=${cand.length}`);
console.log(`   horquilla del contrato ${(100 * media(cand.map((f) => f.horq))).toFixed(2)}%  ·  de sus gemelos ${(100 * media(cand.map((f) => f.horqGem))).toFixed(2)}%  ·  diferencia ${(100 * media(cand.map((f) => f.horq - f.horqGem))).toFixed(3)} puntos`);
console.log(`   gemelos por evento: mediana ${pctl(cand.map((f) => f.nGem), 0.5)} · p10 ${pctl(cand.map((f) => f.nGem), 0.1)}`);
console.log(`   NO puede ser peaje: los gemelos están emparejados por horquilla a proposito.\n`);
console.log(`   ¿de dónde sale el +0,76%? reparto del exceso:`);
console.log(`      mediana ${(100 * pctl(cand.map((f) => f.exc5), 0.5)).toFixed(2)}% · p25 ${(100 * pctl(cand.map((f) => f.exc5), 0.25)).toFixed(2)}% · p75 ${(100 * pctl(cand.map((f) => f.exc5), 0.75)).toFixed(2)}%`);
console.log(`      gana a sus gemelos en el ${((100 * cand.filter((f) => f.exc5 > 0).length) / cand.length).toFixed(1)}% de los eventos`);
{
  const ord = [...cand].sort((a, b) => b.exc5 - a.exc5);
  const sinTop5 = media(ord.slice(5).map((f) => f.exc5));
  console.log(`      quitando las 5 mejores: ${(100 * sinTop5).toFixed(2)}%  (t ${tPorDia(ord.slice(5), "exc5").t.toFixed(2)})`);
}

// ── 4. ATAQUE 2: ¿HACE FALTA ACUMULAR? ──────────────────────────────────────────────────────
console.log(`\n${"=".repeat(108)}`);
console.log(`ATAQUE 2 — ¿aparece igual SIN repetir? Si sí, el hallazgo no es de la repetición`);
console.log(`${"=".repeat(108)}\n`);
const A2 = {};
A2.cand = linea("EL CANDIDATO: >=2 días · >=$2,5M · >=10% fuera", cand);
A2.unDia = linea("mismo tamaño y distancia pero TODO EN UN DIA", hoyAsk.filter((f) => f.diasAct === 1 && f.tot >= 2.5e6 && f.mny >= 0.10));
A2.sinPrima = linea("lejos y acumulado pero SIN mínimo de prima", hoyAsk.filter((f) => f.diasAct >= 2 && f.mny >= 0.10));
A2.todoLejos = linea("TODO contrato del flujo a >=10% fuera", hoyAsk.filter((f) => f.mny >= 0.10));
A2.tres = linea("acumulación de >=3 días · >=$2,5M · >=10%", hoyAsk.filter((f) => f.diasAct >= 3 && f.tot >= 2.5e6 && f.mny >= 0.10));

// ── 5. ATAQUE 3: EL BID ─────────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(108)}`);
console.log(`ATAQUE 3 — el mismo patrón AL BID. Si comprar y vender dan lo mismo, no es dirección`);
console.log(`${"=".repeat(108)}\n`);
const A3 = {};
A3.bid = linea("PLACEBO: acumulación AL BID >=2d >=$2,5M >=10%", filas.filter((f) => f.cuando === "hoy" && f.lado === -1 && CAND(f)));
A3.askLimpio = linea("ask con poco bid en contra (ask > 2x bid)", cand.filter((f) => f.tot > 2 * f.otro));
A3.askSucio = linea("ask con mucho bid en contra (ask < 1,2x bid)", cand.filter((f) => f.tot < 1.2 * f.otro));

// ── 6. ATAQUE 4: EL DIA ANTES ───────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(108)}`);
console.log(`ATAQUE 4 — comprar el día ANTES del evento. Si sale igual, no lo causa el racimo`);
console.log(`${"=".repeat(108)}\n`);
const A4 = {};
A4.hoy = linea("entrando el día del evento (base)", cand);
A4.antes = linea("entrando el día ANTES (imposible saberlo)", filas.filter((f) => f.cuando === "antes" && f.lado === 1 && CAND(f)));

// ── 7. ATAQUE 5: FORMA — monotonía en distancia, días y salida ──────────────────────────────
console.log(`\n${"=".repeat(108)}`);
console.log(`ATAQUE 5 — ¿tiene FORMA? Un efecto real crece con la distancia y con los días`);
console.log(`${"=".repeat(108)}\n`);
const A5 = { dist: [], dias: [], salida: [] };
console.log(`  por DISTANCIA al dinero (acumulación >=2 días, >=$2,5M):`);
for (const [lo, hi, et] of [[-9, 0, "dentro del dinero"], [0, 0.05, "0-5% fuera"], [0.05, 0.10, "5-10% fuera"], [0.10, 0.20, "10-20% fuera"], [0.20, 9, ">=20% fuera"]]) {
  const r = linea(`     ${et}`, hoyAsk.filter((f) => f.diasAct >= 2 && f.tot >= 2.5e6 && f.mny >= lo && f.mny < hi));
  if (r) A5.dist.push({ ...r, lo, hi });
}
console.log(`\n  por DIAS ACTIVOS (contratos a >=10% fuera, >=$2,5M):`);
for (const [lo, hi, et] of [[1, 1, "1 día"], [2, 2, "2 días"], [3, 5, "3-5 días"]]) {
  const r = linea(`     ${et}`, hoyAsk.filter((f) => f.diasAct >= lo && f.diasAct <= hi && f.tot >= 2.5e6 && f.mny >= 0.10));
  if (r) A5.dias.push({ ...r, lo, hi });
}
console.log(`\n  por PLAZO DE SALIDA (el candidato entero):`);
for (const K of SALIDAS) {
  const r = linea(`     salir a ${K} días`, cand, `exc${K}`);
  if (r) A5.salida.push({ ...r, K });
}

// ── 8. ATAQUE 6: ¿VIVE EN UN ACTIVO? ────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(108)}`);
console.log(`ATAQUE 6 — ¿vive en un activo o en cuatro operaciones?`);
console.log(`${"=".repeat(108)}\n`);
const A6 = { porTicker: [], fuera: [] };
{
  const c = new Map();
  for (const f of cand) { if (!c.has(f.ticker)) c.set(f.ticker, []); c.get(f.ticker).push(f); }
  const top = [...c.entries()].sort((a, b) => b[1].length - a[1].length);
  console.log(`   ${cand.length} eventos en ${c.size} activos · nef=${nEfectiva(cand, 5).porTicker} · ventanas de calendario independientes: ${nEfectiva(cand, 5).ventanas}`);
  console.log(`   mayor: ${top[0][0]} con ${top[0][1].length} = ${((100 * top[0][1].length) / cand.length).toFixed(1)}% ${top[0][1].length / cand.length > 0.2 ? "<< PASA DEL 20%: la criba de concentración NO se cumple" : ""}`);
  for (const [t, v] of top.slice(0, 8)) {
    console.log(`      ${t.padEnd(6)} n=${String(v.length).padStart(3)}  exceso ${(100 * media(v.map((x) => x.exc5))).toFixed(2).padStart(6)}%  ${media(v.map((x) => x.exc5)) > 0 ? "+" : "-"}`);
    A6.porTicker.push({ t, n: v.length, media: media(v.map((x) => x.exc5)) });
  }
  const fu = [];
  for (const [t, v] of top) if (v.length >= 8) { const f = cand.filter((x) => x.ticker !== t); fu.push({ t, n: f.length, tt: tPorDia(f, "exc5").t, m: media(f.map((x) => x.exc5)) }); }
  fu.sort((a, b) => Math.abs(a.tt) - Math.abs(b.tt));
  console.log(`\n   dejando fuera un activo cada vez (los que tienen >=8 eventos):`);
  for (const o of fu) console.log(`      sin ${o.t.padEnd(6)} n=${String(o.n).padStart(3)}  media ${(100 * o.m).toFixed(2).padStart(6)}%  t ${o.tt.toFixed(2).padStart(6)}  ${Math.abs(o.tt) >= LISTON ? "sigue cruzando" : "<< deja de cruzar"}`);
  A6.fuera = fu;
  console.log(`   cruza el listón en ${fu.filter((o) => Math.abs(o.tt) >= LISTON).length} de ${fu.length} versiones.`);
}

// ── 9. ATAQUE 7: EL AZAR ────────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(108)}`);
console.log(`ATAQUE 7 — ${SORTEOS} sorteos: un GEMELO al azar en vez del contrato acumulado`);
console.log(`${"=".repeat(108)}\n`);
{
  const az = rng(20260820);
  const obs = tPorDia(cand, "ret5").m;
  const nulos = [];
  const pd = new Map();
  for (const x of cand) { if (!pd.has(x.fechaY)) pd.set(x.fechaY, []); pd.get(x.fechaY).push(x); }
  for (let it = 0; it < SORTEOS; it++) {
    const md = [];
    for (const [, v] of pd) md.push(media(v.map(() => v[Math.floor(az() * v.length)].gem5)));
    nulos.push(media(md));
  }
  const mN = media(nulos), sN = sd(nulos);
  const cola = nulos.filter((x) => x >= obs).length / SORTEOS;
  console.log(`   contrato acumulado ${(100 * obs).toFixed(2)}%  ·  gemelo sorteado ${(100 * mN).toFixed(2)}% ±${(100 * sN).toFixed(2)}  ·  z=${((obs - mN) / sN).toFixed(2)}  ·  p=${cola.toFixed(3)}`);
}

// ── 10. DINERO ──────────────────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(108)}`);
console.log(`EN DOLARES AL AÑO sobre $${fmt(CUENTA)} — si alguien lo operara`);
console.log(`${"=".repeat(108)}\n`);
const dinero = [];
for (const [nombre, f, campo] of [["el contrato acumulado", cand, "ret5"], ["su gemelo (el azar)", cand, "gem5"]]) {
  const prima = media(f.map((x) => x.prima));
  const m = media(f.map((x) => x[campo]));
  const diasPos = media(f.map((x) => x.diasPos));
  const nCtr = Math.max(1, Math.floor((CUENTA * 0.1) / prima));
  const anual = nCtr * prima * m * (365 / diasPos);
  const ac = (100 * f.filter((x) => x[campo] > 0).length) / f.length;
  console.log(`  ${nombre.padEnd(24)} ${String(f.length).padStart(4)} ops (${(f.length / 86 * 252).toFixed(0)}/año) · prima $${fmt(prima).padStart(6)} · ${nCtr} ctr = $${fmt(nCtr * prima).padStart(6)} · ${(100 * m).toFixed(2).padStart(7)}%/op · acierto ${ac.toFixed(1)}% · ${("$" + fmt(anual)).padStart(9)}/año`);
  dinero.push({ nombre, n: f.length, prima, nCtr, comprometido: nCtr * prima, media: m, anual, acierto: ac, diasPos, opsAno: f.length / 86 * 252 });
}
{
  const d = media(cand.map((f) => f.exc5));
  const prima = media(cand.map((f) => f.prima));
  const nCtr = Math.max(1, Math.floor((CUENTA * 0.1) / prima));
  const diasPos = media(cand.map((f) => f.diasPos));
  console.log(`\n  la VENTAJA sobre el gemelo, si se pudiera cobrar sola: ${(100 * d).toFixed(2)}%/op × ${nCtr} ctr × $${fmt(prima)} × ${(365 / diasPos).toFixed(0)} ciclos = $${fmt(nCtr * prima * d * (365 / diasPos))}/año`);
  console.log(`  PERO el retorno crudo es ${(100 * media(cand.map((f) => f.ret5))).toFixed(2)}%: elegir mejor dentro de un rincón que pierde sigue perdiendo.`);
}

writeFileSync("scripts/rep-4-candidato.json", JSON.stringify({ LISTON, A2, A3, A4, A5, A6, dinero }, null, 1));
console.log(`\n  -> scripts/rep-4-candidato.json\n`);
