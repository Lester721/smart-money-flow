// SEGUIR EL PRINT · 6 — ¿ES PRECIO O ES HORQUILLA? Y por qué la vertical daba −72%.
//
// Dos cosas que hay que cerrar antes de contarle nada a Lester:
//
// A. EL EXCESO DE +0,84% DEL PASE 5 ES LA HORQUILLA, NO UNA SEÑAL.
//    El contrato golpeado batía a sus vecinos un +0,84% con t=5,7 … y lo hacía IGUAL cuando el
//    print entraba al ask (+0,84%) que cuando entraba al bid (+0,67%). Un efecto idéntico en el
//    lado comprador y en el vendedor no es dirección: es que el contrato golpeado es el LÍQUIDO
//    (peaje 2,1% contra el de sus vecinos) y comprarlo al ask cuesta menos. Es EXACTAMENTE el
//    error del 2026-08-16 —"el flujo bate a su cubo +0,68% (t=17,6)", que era la horquilla—.
//    Aquí se comprueba emparejando los vecinos TAMBIÉN por horquilla.
//
// B. ¿LA VENTAJA DIRECCIONAL DE LA ESQUINA ES PRECIO O ES COSTE DE EJECUCIÓN?
//    Se recalcula el efecto principal PUNTO MEDIO A PUNTO MEDIO. Eso NO es un P&L —comprar al
//    medio no existe— y no se reporta como dinero. Es un DIAGNÓSTICO: si el efecto sobrevive al
//    medio, hay un movimiento de precio de verdad; si desaparece, era la horquilla del día.
//
// C. LA VERTICAL: −72% del riesgo por operación y gana el 4% de las veces es un BUG, no un
//    resultado. Se abre en canal con ejemplos.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/print-6-mecanismo.mjs

import { writeFileSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";
import {
  cadena, cierres, diasDe, tickersConCadena, elegirEsquina, bidSalida, limpiarCache,
  dias, media, sd, tUna, pctl, fmt,
} from "./print-lib.mjs";
import { listonT } from "../lib/barreraHallazgos.ts";

const K_SAL = 5, DIST = 0.05, DTE_OBJ = 90, TOL_DTE = 25, MIN_PREM = 2.5e6;
const LISTON = listonT(120);
const ASK = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const BID = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);

const conCad = tickersConCadena().filter((t) => cierres(t));
const diasPorTk = new Map(conCad.map((t) => [t, diasDe(t).filter((d) => d >= "20260422")]));
const setDias = new Map(conCad.map((t) => [t, new Set(diasPorTk.get(t))]));
const ULTIMO = [...diasPorTk.values()].flat().sort().pop();
const tPorDia = (f, c) => { const m = new Map(); for (const x of f) { if (!m.has(x.fechaY)) m.set(x.fechaY, []); m.get(x.fechaY).push(x[c]); } const d = [...m.values()].map(media); return { t: tUna(d), n: d.length, m: media(d) }; };

console.log(`\n${"═".repeat(104)}`);
console.log(`SEGUIR EL PRINT · 6 — ¿precio o horquilla?`);
console.log(`${"═".repeat(104)}\n`);

// ── PRINTS ──────────────────────────────────────────────────────────────────────────────────
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
    if (lado === 0 || o.premium < MIN_PREM) continue;
    eventos.push({ dia, dY, tk: q.raiz, tipo: q.tipo, K: q.strike, exp: q.exp, prem: o.premium, lado, patas: inst.get(k).size, dir: q.tipo === "C" ? 1 : -1, dte: dias(dY, q.exp) });
  }
}

// ── REJILLA con las DOS convenciones ────────────────────────────────────────────────────────
const rejilla = new Map();
for (const tk of conCad) {
  limpiarCache();
  const misDias = diasPorTk.get(tk), cl = cierres(tk);
  for (const dY of misDias) {
    if (dY > ULTIMO) continue;
    const S = cl[dY];
    if (!(S > 0)) continue;
    const cad = cadena(tk, dY);
    if (!cad) continue;
    const c = elegirEsquina(cad, S, DTE_OBJ, DIST, "C", dY, TOL_DTE);
    const p = elegirEsquina(cad, S, DTE_OBJ, DIST, "P", dY, TOL_DTE);
    if (!c || !p || c.exp !== p.exp) continue;
    const salida = misDias.find((d) => d > dY && dias(dY, d) >= K_SAL);
    if (!salida || salida > c.exp) continue;
    const cs = cadena(tk, salida);
    if (!cs) continue;
    const qC = cs[c.exp]?.[`${c.K}|C`], qP = cs[p.exp]?.[`${p.K}|P`];
    const bC = qC ? qC[0] : 0, aC = qC ? qC[1] : 0, bP = qP ? qP[0] : 0, aP = qP ? qP[1] : 0;
    // real (lo que se cobra): comprar al ask, vender al bid
    const rC = bC / c.ask - 1, rP = bP / p.ask - 1;
    // DIAGNÓSTICO (no es dinero): medio a medio. Sin cotización de salida el medio es 0.
    const mC0 = (c.ask + c.bid) / 2, mP0 = (p.ask + p.bid) / 2;
    const mC1 = qC ? (aC + bC) / 2 : 0, mP1 = qP ? (aP + bP) / 2 : 0;
    const dC = mC1 / mC0 - 1, dP = mP1 / mP0 - 1;
    rejilla.set(`${tk}|${dY}`, {
      g: (rC - rP) / 2, gMid: (dC - dP) / 2,
      peajeC: (c.ask - c.bid) / c.ask, peajeP: (p.ask - p.bid) / p.ask,
      askC: c.ask * 100, askP: p.ask * 100,
    });
  }
}
const porDia = new Map();
for (const [k, r] of rejilla) { const [tk, dY] = k.split("|"); if (!porDia.has(dY)) porDia.set(dY, []); porDia.get(dY).push({ tk, ...r }); }
const gDia = new Map([...porDia.entries()].map(([d, v]) => [d, media(v.map((x) => x.g))]));
const gDiaMid = new Map([...porDia.entries()].map(([d, v]) => [d, media(v.map((x) => x.gMid))]));

// ── B. ¿PRECIO O HORQUILLA? ─────────────────────────────────────────────────────────────────
console.log(`${"═".repeat(104)}`);
console.log(`B. EL EFECTO PRINCIPAL, MEDIDO DE LAS DOS MANERAS  (ASK ≥$${(MIN_PREM / 1e6).toFixed(1)}M · esquina 5%/90d · salida ${K_SAL}d)`);
console.log(`${"═".repeat(104)}\n`);
{
  const mejor = new Map();
  for (const e of eventos) { if (e.lado !== 1) continue; const k = `${e.tk}|${e.dY}`; const a = mejor.get(k); if (!a || e.prem > a.prem) mejor.set(k, e); }
  const f = [];
  for (const e of mejor.values()) {
    const r = rejilla.get(`${e.tk}|${e.dY}`);
    if (!r) continue;
    f.push({
      ticker: e.tk, fechaY: e.dY, dir: e.dir,
      real: e.dir * (r.g - gDia.get(e.dY)),
      mid: e.dir * (r.gMid - gDiaMid.get(e.dY)),
      peaje: e.dir === 1 ? r.peajeC : r.peajeP,
    });
  }
  const tR = tPorDia(f, "real"), tM = tPorDia(f, "mid");
  console.log(`   n=${f.length} en ${tR.n} días`);
  console.log(`   REAL   (compra al ask, venta al bid) : ${(100 * media(f.map((x) => x.real))).toFixed(2).padStart(6)}%   t por día ${tR.t.toFixed(2)}   ${Math.abs(tR.t) >= LISTON ? "◄ cruza el listón" : ""}`);
  console.log(`   MEDIO  (diagnóstico, NO es dinero)   : ${(100 * media(f.map((x) => x.mid))).toFixed(2).padStart(6)}%   t por día ${tM.t.toFixed(2)}   ${Math.abs(tM.t) >= LISTON ? "◄ cruza el listón" : ""}`);
  console.log(`\n   → si el efecto sobrevive al MEDIO, es un movimiento de precio real y no la horquilla del día.`);

  // ¿está más cara la esquina el día del print? Se compara el peaje de la pata elegida contra
  // el de los MISMOS tickers en los días SIN print.
  const conPrint = new Set([...mejor.keys()]);
  const sin = [], con = [];
  for (const [k, r] of rejilla) {
    const p = (r.peajeC + r.peajeP) / 2;
    (conPrint.has(k) ? con : sin).push(p);
  }
  console.log(`\n   peaje de la esquina · días CON print grande: ${(100 * media(con)).toFixed(2)}% (n=${con.length})  ·  días SIN: ${(100 * media(sin)).toFixed(2)}% (n=${sin.length})`);
  console.log(`   (si fueran muy distintos, la "ventaja" podría ser sólo que ese día la esquina estaba más cara de comprar)`);
}

// ── A. LOS VECINOS, EMPAREJADOS TAMBIÉN POR HORQUILLA ───────────────────────────────────────
console.log(`\n${"═".repeat(104)}`);
console.log(`A. EL CONTRATO GOLPEADO CONTRA SUS VECINOS · con y sin emparejar la HORQUILLA`);
console.log(`${"═".repeat(104)}\n`);
{
  const porClave = new Map();
  for (const e of eventos) { const k = `${e.tk}|${e.dY}|${e.lado}`; const a = porClave.get(k); if (!a || e.prem > a.prem) porClave.set(k, e); }
  const out = [];
  let tkA = null;
  for (const e of [...porClave.values()].sort((a, b) => (a.tk + a.dY).localeCompare(b.tk + b.dY))) {
    if (e.tk !== tkA) { limpiarCache(); tkA = e.tk; }
    const cad = cadena(e.tk, e.dY), S = cierres(e.tk)?.[e.dY];
    if (!cad || !(S > 0)) continue;
    const q = cad[e.exp]?.[`${e.K}|${e.tipo}`];
    if (!q || !(q[0] > 0) || !(q[1] > 0)) continue;
    const [b0, a0] = q, peaje0 = (a0 - b0) / a0;
    const misDias = diasPorTk.get(e.tk);
    const salida = misDias.find((d) => d > e.dY && dias(e.dY, d) >= K_SAL);
    if (!salida || salida > e.exp) continue;
    const vb = bidSalida(e.tk, salida, e.exp, e.tipo, e.K);
    if (vb === null) continue;
    const ret = vb / a0 - 1;
    const dist0 = e.tipo === "C" ? e.K / S - 1 : 1 - e.K / S;
    const todos = [], parecidos = [];
    for (const exp of Object.keys(cad)) {
      const d2 = dias(e.dY, exp);
      if (d2 < 1 || Math.abs(d2 - e.dte) > Math.max(3, e.dte * 0.25) || exp <= salida) continue;
      for (const clave of Object.keys(cad[exp])) {
        const [ks, tp] = clave.split("|");
        if (tp !== e.tipo) continue;
        const K2 = Number(ks);
        if (exp === e.exp && K2 === e.K) continue;
        const dist2 = e.tipo === "C" ? K2 / S - 1 : 1 - K2 / S;
        if (Math.abs(dist2 - dist0) > 0.03) continue;
        const [bb, aa] = cad[exp][clave];
        if (!(bb > 0) || !(aa > 0)) continue;
        const v2 = bidSalida(e.tk, salida, exp, tp, K2);
        if (v2 === null) continue;
        const r2 = v2 / aa - 1, p2 = (aa - bb) / aa;
        todos.push(r2);
        if (Math.abs(p2 - peaje0) <= 0.005) parecidos.push(r2);           // misma horquilla ±0,5 pp
      }
    }
    if (todos.length < 3) continue;
    out.push({
      ticker: e.tk, fechaY: e.dY, lado: e.lado, ret, peaje0,
      excesoTodos: ret - media(todos),
      excesoIgualHorquilla: parecidos.length >= 3 ? ret - media(parecidos) : null,
      nPar: parecidos.length,
    });
  }
  console.log(`  ${"lado".padEnd(5)} ${"n".padStart(5)}  ${"exceso vs TODOS".padStart(16)}  ${"n".padStart(5)}  ${"exceso con MISMA HORQUILLA".padStart(27)}`);
  const R = {};
  for (const lado of [1, -1]) {
    const f = out.filter((x) => x.lado === lado);
    const g = f.filter((x) => x.excesoIgualHorquilla != null);
    const t1 = tPorDia(f, "excesoTodos"), t2 = tPorDia(g, "excesoIgualHorquilla");
    console.log(`  ${(lado === 1 ? "ASK" : "BID").padEnd(5)} ${String(f.length).padStart(5)}  ${(100 * media(f.map((x) => x.excesoTodos))).toFixed(2).padStart(8)}% t=${t1.t.toFixed(2).padStart(6)}  ${String(g.length).padStart(5)}  ${(100 * media(g.map((x) => x.excesoIgualHorquilla))).toFixed(2).padStart(8)}% t=${t2.t.toFixed(2).padStart(6)}`);
    R[lado === 1 ? "ask" : "bid"] = { n: f.length, todos: media(f.map((x) => x.excesoTodos)), tTodos: t1.t, nIgual: g.length, igual: media(g.map((x) => x.excesoIgualHorquilla)), tIgual: t2.t };
  }
  console.log(`\n   El lado BID es el control: si el "exceso" fuera una señal direccional NO puede salir igual`);
  console.log(`   comprando que vendiendo. Si sale igual en los dos, es la horquilla.`);
  writeFileSync("scripts/print-6-vecinos.json", JSON.stringify(R, null, 1));
}

// ── C. LA VERTICAL, ABIERTA EN CANAL ────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(104)}`);
console.log(`C. LA VERTICAL — por qué daba −72% del riesgo. Diez ejemplos con todos los números a la vista`);
console.log(`${"═".repeat(104)}\n`);
{
  const porClave = new Map();
  for (const e of eventos) { if (e.lado !== 1) continue; const k = `${e.tk}|${e.dY}`; const a = porClave.get(k); if (!a || e.prem > a.prem) porClave.set(k, e); }
  let n = 0;
  const anchos = [], creditos = [], faltaLarga = [], faltaCorta = [];
  for (const e of [...porClave.values()].sort((a, b) => (a.tk + a.dY).localeCompare(b.tk + b.dY))) {
    const cad = cadena(e.tk, e.dY);
    if (!cad) continue;
    const q = cad[e.exp]?.[`${e.K}|${e.tipo}`];
    if (!q) continue;
    const [b0, a0] = q;
    let K2 = null, mejor = Infinity;
    for (const clave of Object.keys(cad[e.exp])) {
      const [ks, tp] = clave.split("|");
      if (tp !== e.tipo) continue;
      const kk = Number(ks);
      if (!(e.tipo === "C" ? kk > e.K : kk < e.K)) continue;
      const d = Math.abs(kk - e.K);
      if (d < mejor) { mejor = d; K2 = kk; }
    }
    if (K2 == null) continue;
    const [b2, a2] = cad[e.exp][`${K2}|${e.tipo}`];
    const misDias = diasPorTk.get(e.tk);
    const salida = misDias.find((d) => d > e.dY && dias(e.dY, d) >= K_SAL);
    if (!salida) continue;
    const cs = cadena(e.tk, salida);
    const s1 = cs?.[e.exp]?.[`${e.K}|${e.tipo}`], s2 = cs?.[e.exp]?.[`${K2}|${e.tipo}`];
    const ancho = Math.abs(K2 - e.K), credito = b0 - a2;
    anchos.push(ancho); creditos.push(credito);
    if (!s2) faltaLarga.push(1); if (!s1) faltaCorta.push(1);
    if (n < 10) {
      console.log(`  ${e.tk} ${e.dY} ${e.tipo} K1=${e.K} K2=${K2} (ancho ${ancho})  exp ${e.exp}`);
      console.log(`     entrada: corta bid ${b0.toFixed(2)} / ask ${a0.toFixed(2)} · larga bid ${b2.toFixed(2)} / ask ${a2.toFixed(2)} → crédito ${(b0 - a2).toFixed(2)}`);
      console.log(`     salida ${salida}: corta ${s1 ? `${s1[0].toFixed(2)}/${s1[1].toFixed(2)}` : "SIN COTIZACIÓN"} · larga ${s2 ? `${s2[0].toFixed(2)}/${s2[1].toFixed(2)}` : "SIN COTIZACIÓN"}` +
                  ` → coste ${((s1 ? s1[1] : 0) - (s2 ? s2[0] : 0)).toFixed(2)}  ·  P&L ${(100 * ((b0 - a2) - ((s1 ? s1[1] : 0) - (s2 ? s2[0] : 0)))).toFixed(0)}$`);
      n++;
    }
  }
  console.log(`\n   ancho del strike de al lado: p50 ${pctl(anchos, 0.5)} · p90 ${pctl(anchos, 0.9)} puntos`);
  console.log(`   crédito de la vertical de un botón: p50 ${pctl(creditos, 0.5).toFixed(2)} · negativos ${creditos.filter((x) => x <= 0).length} de ${creditos.length}`);
  console.log(`   veces que a la SALIDA falta la pata LARGA: ${faltaLarga.length} · la CORTA: ${faltaCorta.length} de ${creditos.length}`);
  console.log(`\n   Un crédito que es una fracción tan pequeña del ancho no es una vertical vendida: es`);
  console.log(`   comprar riesgo casi gratis para el otro lado. Y valorar la pata larga en CERO cuando`);
  console.log(`   le falta cotización mientras la corta se recompra al ask entero es un sesgo de una`);
  console.log(`   sola dirección: infla la pérdida en todas las que se cierran mal.`);
}
console.log("");
