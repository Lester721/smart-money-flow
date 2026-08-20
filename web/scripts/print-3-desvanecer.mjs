// SEGUIR EL PRINT · 3 — LA REGLA, MEDIDA COMO SE EJECUTA Y CONTADA EN DÓLARES.
//
// ═══ DE DÓNDE VIENE ═════════════════════════════════════════════════════════════════════════
//
// El pase 2 quitó la deriva del control y dejó una sola cosa en pie, y salió INVERTIDA:
//
//   cuanto MÁS GRANDE es el print agresivo al ask, PEOR va su dirección a 5 días
//     ≥$0,25M → −1,85%   ≥$1M → −2,79%   ≥$2,5M → −3,95%   (neutral de mercado, monótono)
//
// Mecanismo plausible, y comprobable: quien paga al ask por 2,5 millones de dólares de calls
// **infla esa call contra su put** (mueve el sesgo, no sólo el nivel de volatilidad). Los días
// siguientes el sesgo vuelve a su sitio y la call lo hace peor que la put. No es que el dinero
// grande se equivoque de dirección: es que **paga de más por la prisa**, y el que llega detrás
// compra ese sobreprecio.
//
// Este pase lo mide como se ejecuta y lo cuenta en dinero:
//   · t POR DÍA (no por fila): dos entradas del mismo día comparten mercado. La t de 651 filas
//     supone 651 apuestas independientes y NO lo son. Se agrupa por día y se mide sobre las
//     medias diarias. Es el número honesto y es el que manda aquí.
//   · rejilla completa declarada antes de mirar: 2 lados × 3 tipos × 5 primas × 4 salidas.
//   · CALL y PUT por separado: si el efecto es sesgo, tiene que salir en los DOS. Si sólo sale
//     en uno, es deriva disfrazada.
//   · dinero: retorno absoluto por operación con precios reales, prima comprometida, $/año.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/print-3-desvanecer.mjs

import { writeFileSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";
import {
  cadena, cierres, diasDe, tickersConCadena, elegirEsquina, bidSalida, limpiarCache,
  dias, media, sd, tUna, pctl, fmt, rng, nEfectiva,
} from "./print-lib.mjs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT, comprobarDescarte, potencia } from "../lib/barreraHallazgos.ts";

const CUENTA = 56389;
const DIST = 0.05, DTE_OBJ = 90, TOL_DTE = 25;
const SALIDAS = [3, 5, 10, 23];
const PRIMAS = [0.25e6, 1e6, 2.5e6, 5e6, 10e6];
const TIPOS = ["ambos", "C", "P"];
const LADOS = [1, -1];
const PERM = Number(process.env.PERM || 3000);
const ASK = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const BID = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);
const PRUEBAS = LADOS.length * TIPOS.length * PRIMAS.length * SALIDAS.length;
const LISTON = listonT(PRUEBAS);

const conCad = tickersConCadena().filter((t) => cierres(t));
const diasPorTk = new Map(conCad.map((t) => [t, diasDe(t).filter((d) => d >= "20260422")]));
const setDias = new Map(conCad.map((t) => [t, new Set(diasPorTk.get(t))]));
const ULTIMO = [...diasPorTk.values()].flat().sort().pop() ?? "20260806";

console.log(`\n${"═".repeat(106)}`);
console.log(`SEGUIR EL PRINT · 3 — la regla medida como se ejecuta`);
console.log(`${"═".repeat(106)}`);
console.log(`  ${conCad.length} tickers · cadenas hasta ${ULTIMO} · esquina ${(DIST * 100).toFixed(0)}% fuera / ~${DTE_OBJ}d`);
console.log(`  ${PRUEBAS} pruebas declaradas (${LADOS.length} lados × ${TIPOS.length} tipos × ${PRIMAS.length} primas × ${SALIDAS.length} salidas) · listón |t| ≥ ${LISTON}\n`);

/** t de una muestra AGRUPANDO POR DÍA. Es lo honesto: las apuestas del mismo día no son independientes. */
function tPorDia(filas, campo) {
  const m = new Map();
  for (const f of filas) { if (!m.has(f.fechaY)) m.set(f.fechaY, []); m.get(f.fechaY).push(f[campo]); }
  const d = [...m.values()].map(media);
  return { t: tUna(d), nDias: d.length, mediaDia: media(d) };
}

// ── 1. PRINTS ───────────────────────────────────────────────────────────────────────────────
const eventos = [];
let leidos = 0;
const setCad = new Set(conCad);
for (const dia of diasFlujo("100k")) {
  const crudos = leerDia(dia, "100k");
  if (!crudos.length) continue;
  leidos += crudos.length;
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
    eventos.push({
      dia, dY, tk: q.raiz, tipo: q.tipo, prem: o.premium, lado, patas: inst.get(k).size,
      dir: (q.tipo === "C" ? 1 : -1) * lado, et,
      exp: q.exp, K: q.strike, dtePrint: dias(dY, q.exp), ask: o.ask_price, bid: o.bid_price,
    });
  }
}
console.log(`## 1. ${fmt(leidos)} prints → ${fmt(eventos.length)} candidatos operables`);
comprobarDescarte(leidos, eventos.length, "criba de admisión", 0.995);
radiografia(eventos.slice(0, 150000), ["prem", "patas", "et", "dtePrint"], "prints candidatos", { minDistintos: 3 });

// ── 2. REJILLA DE LA ESQUINA ────────────────────────────────────────────────────────────────
const rejilla = new Map();
let intentos = 0;
for (const tk of conCad) {
  limpiarCache();
  const misDias = diasPorTk.get(tk), cl = cierres(tk);
  for (const dY of misDias) {
    if (dY > ULTIMO) continue;
    intentos++;
    const S = cl[dY];
    if (!(S > 0)) continue;
    const cad = cadena(tk, dY);
    if (!cad) continue;
    const c = elegirEsquina(cad, S, DTE_OBJ, DIST, "C", dY, TOL_DTE);
    const p = elegirEsquina(cad, S, DTE_OBJ, DIST, "P", dY, TOL_DTE);
    if (!c || !p || c.exp !== p.exp) continue;
    const ret = {};
    for (const k of SALIDAS) {
      const salida = misDias.find((d) => d > dY && dias(dY, d) >= k);
      if (!salida || salida > c.exp) continue;
      const vC = bidSalida(tk, salida, c.exp, "C", c.K), vP = bidSalida(tk, salida, p.exp, "P", p.K);
      if (vC === null || vP === null) continue;
      const rC = vC / c.ask - 1, rP = vP / p.ask - 1;
      ret[k] = { C: rC, P: rP, g: (rC - rP) / 2, m: (rC + rP) / 2, diasPos: dias(dY, salida) };
    }
    if (!Object.keys(ret).length) continue;
    rejilla.set(`${tk}|${dY}`, { askC: c.ask * 100, askP: p.ask * 100, ret, peaje: ((c.ask - c.bid) / c.ask + (p.ask - p.bid) / p.ask) / 2 });
  }
}
const pool = new Map();
for (const k of SALIDAS) {
  const m = new Map();
  for (const [clave, r] of rejilla) {
    const rr = r.ret[k]; if (!rr) continue;
    const [tk, dY] = clave.split("|");
    if (!m.has(dY)) m.set(dY, []);
    m.get(dY).push({ tk, g: rr.g, mm: rr.m, C: rr.C, P: rr.P });
  }
  pool.set(k, m);
}
console.log(`## 2. rejilla: ${fmt(rejilla.size)} de ${fmt(intentos)} (ticker, día) con las dos patas y salida real\n`);
console.log(`   ${"salida".padEnd(7)} ${"n".padStart(6)}  ${"ĝ deriva".padStart(9)}  ${"coste del vehículo".padStart(18)}  ${"peaje".padStart(6)}`);
for (const k of SALIDAS) {
  const t = [...pool.get(k).values()].flat();
  console.log(`   ${(k + "d").padEnd(7)} ${String(t.length).padStart(6)}  ${(100 * media(t.map((x) => x.g))).toFixed(2).padStart(8)}%  ${(100 * media(t.map((x) => x.mm))).toFixed(2).padStart(17)}%  ${(100 * media([...rejilla.values()].map((r) => r.peaje))).toFixed(1).padStart(5)}%`);
}

// ── 3. LA REJILLA DE PRUEBAS ────────────────────────────────────────────────────────────────
function entradas(lado, tipo, minPrem) {
  const mejor = new Map();
  for (const e of eventos) {
    if (e.lado !== lado || e.prem < minPrem) continue;
    if (tipo !== "ambos" && e.tipo !== tipo) continue;
    const k = `${e.tk}|${e.dY}`;
    if (!rejilla.has(k)) continue;
    const a = mejor.get(k);
    if (!a || e.prem > a.prem) mejor.set(k, e);
  }
  return [...mejor.values()];
}

const filasDe = (ent, k) => {
  const porDia = pool.get(k), out = [];
  for (const e of ent) {
    const r = rejilla.get(`${e.tk}|${e.dY}`), rr = r?.ret[k];
    if (!rr) continue;
    const dia = porDia.get(e.dY) ?? [];
    const gDia = media(dia.map((x) => x.g));
    // SEGUIR = comprar en la dirección del print · DESVANECER = comprar la contraria
    out.push({
      ticker: e.tk, fecha: e.dia, fechaY: e.dY, dir: e.dir, tipo: e.tipo, prem: e.prem,
      seguirNeutral: e.dir * (rr.g - gDia),
      seguirBruto: e.dir * rr.g,
      retSeguir: e.dir === 1 ? rr.C : rr.P,
      retDesv: e.dir === 1 ? rr.P : rr.C,
      primaSeguir: e.dir === 1 ? r.askC : r.askP,
      primaDesv: e.dir === 1 ? r.askP : r.askC,
      diasPos: rr.diasPos, peaje: r.peaje,
    });
  }
  return out;
};

const tabla = [];
for (const lado of LADOS) for (const tipo of TIPOS) for (const minPrem of PRIMAS) {
  const ent = entradas(lado, tipo, minPrem);
  for (const k of SALIDAS) {
    const f = filasDe(ent, k);
    if (f.length < 40) { tabla.push({ lado, tipo, minPrem, k, n: f.length, corta: true }); continue; }
    const td = tPorDia(f, "seguirNeutral");
    const tks = new Map();
    for (const x of f) tks.set(x.ticker, (tks.get(x.ticker) ?? 0) + 1);
    const may = [...tks.entries()].sort((a, b) => b[1] - a[1])[0];
    const ne = nEfectiva(f, k);
    tabla.push({
      lado, tipo, minPrem, k, n: f.length, filas: f,
      neutral: media(f.map((x) => x.seguirNeutral)), tFila: tUna(f.map((x) => x.seguirNeutral)),
      tDia: td.t, nDias: td.nDias,
      bruto: media(f.map((x) => x.seguirBruto)),
      retSeguir: media(f.map((x) => x.retSeguir)), retDesv: media(f.map((x) => x.retDesv)),
      primaDesv: media(f.map((x) => x.primaDesv)),
      aciertoDesv: f.filter((x) => x.retDesv > x.retSeguir).length / f.length,
      diasPos: media(f.map((x) => x.diasPos)),
      nEfTk: ne.porTicker, nEfVent: ne.ventanas,
      mayor: may ? { t: may[0], pct: may[1] / f.length } : null,
    });
  }
}

console.log(`\n${"═".repeat(106)}`);
console.log(`LA REJILLA · "neutral" = ventaja de SEGUIR al print frente al mercado de ese día (negativo = hay que DESVANECER)`);
console.log(`${"═".repeat(106)}\n`);
for (const lado of LADOS) {
  console.log(`  ── prints ${lado === 1 ? "AL ASK (alguien pagó con prisa)" : "AL BID (alguien vendió con prisa)"} ──`);
  console.log(`  ${"tipo".padEnd(5)} ${"prima".padStart(6)} ${"sal".padStart(3)} ${"n".padStart(5)} ${"días".padStart(4)} ${"vt".padStart(3)}  ${"neutral".padStart(8)} ${"t fila".padStart(6)} ${"t DÍA".padStart(6)}  ${"seguir%".padStart(7)} ${"desvan%".padStart(7)}  ${"acDesv".padStart(6)}  mayor`);
  for (const r of tabla.filter((x) => x.lado === lado)) {
    if (r.corta) continue;
    const m = Math.abs(r.tDia) >= LISTON ? " ◄" : "";
    console.log(`  ${r.tipo.padEnd(5)} ${("$" + (r.minPrem / 1e6).toFixed(2) + "M").padStart(6)} ${String(r.k).padStart(3)} ${String(r.n).padStart(5)} ${String(r.nDias).padStart(4)} ${String(r.nEfVent).padStart(3)}  ` +
      `${(100 * r.neutral).toFixed(2).padStart(7)}% ${r.tFila.toFixed(2).padStart(6)} ${r.tDia.toFixed(2).padStart(6)}  ` +
      `${(100 * r.retSeguir).toFixed(1).padStart(6)}% ${(100 * r.retDesv).toFixed(1).padStart(6)}%  ${(100 * r.aciertoDesv).toFixed(1).padStart(5)}%  ${r.mayor.t} ${(100 * r.mayor.pct).toFixed(0)}%${m}`);
  }
  console.log("");
}

// ── 4. LA MONOTONÍA — la prueba que no se puede fabricar ────────────────────────────────────
console.log(`${"═".repeat(106)}`);
console.log(`MONOTONÍA — si el efecto es real, tiene que CRECER con el tamaño del print`);
console.log(`${"═".repeat(106)}\n`);
for (const lado of LADOS) for (const k of SALIDAS) {
  const fila = PRIMAS.map((p) => tabla.find((x) => x.lado === lado && x.tipo === "ambos" && x.minPrem === p && x.k === k));
  if (fila.some((x) => !x || x.corta)) continue;
  const v = fila.map((x) => x.neutral);
  const mono = v.every((x, i) => i === 0 || x <= v[i - 1]) || v.every((x, i) => i === 0 || x >= v[i - 1]);
  console.log(`  ${lado === 1 ? "ASK" : "BID"} · salida ${String(k).padStart(2)}d :  ` +
    PRIMAS.map((p, i) => `≥$${(p / 1e6).toFixed(2)}M ${(100 * v[i]).toFixed(2).padStart(6)}% (n=${String(fila[i].n).padStart(4)})`).join("  ") + `   ${mono ? "MONÓTONA" : ""}`);
}

// ── 5. ¿SALE EN LAS DOS PATAS? (si sólo sale en una, es deriva) ─────────────────────────────
console.log(`\n${"═".repeat(106)}`);
console.log(`SIMETRÍA — el sesgo tiene que revertir en CALLS y en PUTS. Si sólo en una, no es sesgo: es deriva`);
console.log(`${"═".repeat(106)}\n`);
console.log(`  ${"lado".padEnd(4)} ${"prima".padStart(6)} ${"sal".padStart(3)}  ${"CALLS".padStart(16)}  ${"PUTS".padStart(16)}`);
for (const lado of LADOS) for (const p of PRIMAS) for (const k of SALIDAS) {
  const c = tabla.find((x) => x.lado === lado && x.tipo === "C" && x.minPrem === p && x.k === k);
  const q = tabla.find((x) => x.lado === lado && x.tipo === "P" && x.minPrem === p && x.k === k);
  if (!c || !q || c.corta || q.corta) continue;
  if (p !== 1e6 && p !== 2.5e6) continue;
  console.log(`  ${(lado === 1 ? "ASK" : "BID").padEnd(4)} ${("$" + (p / 1e6).toFixed(1) + "M").padStart(6)} ${String(k).padStart(3)}  ` +
    `${(100 * c.neutral).toFixed(2).padStart(7)}% t=${c.tDia.toFixed(2).padStart(5)} n=${String(c.n).padStart(4)}  ` +
    `${(100 * q.neutral).toFixed(2).padStart(7)}% t=${q.tDia.toFixed(2).padStart(5)} n=${String(q.n).padStart(4)}`);
}

// ── 6. LA BARRERA, adaptada a una regla BINARIA ─────────────────────────────────────────────
// `pasarBarrera` ordena por un criterio CONTINUO y compara tercios. Aquí el criterio es binario
// (el print pasa la regla o no), así que ordenar por él y comparar el tercio alto contra el bajo
// sería comparar la variable consigo misma: sale t=23 y no significa nada. Se aplican LAS MISMAS
// CUATRO CRIBAS, con la t de una muestra AGRUPADA POR DÍA en lugar de la separación por tercios.
function barreraBinaria(filas, campo, nombre) {
  const motivos = [], ok = [];
  if (filas.length < 200) motivos.push(`muestra de ${filas.length}, hacen falta 200`);
  else ok.push(`muestra ${filas.length} ≥ 200`);
  const c = new Map();
  for (const f of filas) c.set(f.ticker, (c.get(f.ticker) ?? 0) + 1);
  const may = [...c.entries()].sort((a, b) => b[1] - a[1])[0];
  if (may && may[1] / filas.length > 0.2) motivos.push(`${may[0]} es el ${((100 * may[1]) / filas.length).toFixed(1)}% de la muestra (máximo 20%)`);
  else ok.push(`ningún activo pasa del 20% (mayor: ${may[0]} ${((100 * may[1]) / filas.length).toFixed(1)}%)`);
  const ord = [...filas].sort((a, b) => a.fechaY.localeCompare(b.fechaY));
  const kk = Math.floor(ord.length / 3);
  const ter = [0, 1, 2].map((i) => (i < 2 ? ord.slice(i * kk, (i + 1) * kk) : ord.slice(2 * kk)));
  const med = ter.map((g) => media(g.map((x) => x[campo])));
  if (kk < 3) motivos.push("sin muestra para tres tercios");
  else if (!(Math.sign(med[0]) === Math.sign(med[1]) && Math.sign(med[1]) === Math.sign(med[2])))
    motivos.push(`el signo NO se repite en los tres tercios (${med.map((x) => (100 * x).toFixed(2) + "%").join(" · ")})`);
  else ok.push(`mismo signo en los tres tercios (${med.map((x) => (100 * x).toFixed(2) + "%").join(" · ")})`);
  const td = tPorDia(filas, campo);
  if (Math.abs(td.t) < LISTON) motivos.push(`t por día = ${td.t.toFixed(2)}, por debajo del listón de ${LISTON} para ${PRUEBAS} pruebas`);
  else ok.push(`t por día = ${td.t.toFixed(2)} ≥ ${LISTON}`);
  console.log(`\n${motivos.length ? "⛔" : "✅"} ${nombre} — ${motivos.length ? "NO SE PUEDE REPORTAR COMO HALLAZGO" : "PASA LAS CUATRO CRIBAS"}\n`);
  for (const m of motivos) console.log(`  ✗ ${m}`);
  for (const a of ok) console.log(`  ✓ ${a}`);
  console.log(`\n  n=${filas.length} en ${td.nDias} días · media ${(100 * media(filas.map((f) => f[campo]))).toFixed(2)}% · media diaria ${(100 * td.mediaDia).toFixed(2)}% · t por día ${td.t.toFixed(2)} (listón ${LISTON})`);
  return { pasa: motivos.length === 0, t: td.t, nDias: td.nDias, motivos };
}

console.log(`\n${"═".repeat(106)}`);
console.log(`LA BARRERA sobre las mejores candidatas`);
console.log(`${"═".repeat(106)}`);
const mejores = tabla.filter((r) => !r.corta && r.n >= 200).sort((a, b) => Math.abs(b.tDia) - Math.abs(a.tDia)).slice(0, 4);
const veredictos = [];
for (const r of mejores)
  veredictos.push({ r, v: barreraBinaria(r.filas, "seguirNeutral", `${r.lado === 1 ? "ASK" : "BID"} · ${r.tipo} · ≥$${(r.minPrem / 1e6).toFixed(2)}M · ${r.k}d`) });

// ── 7. EL DINERO ────────────────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(106)}`);
console.log(`EL DINERO — desvanecer el print, con precios reales, sobre una cuenta de $${fmt(CUENTA)}`);
console.log(`${"═".repeat(106)}\n`);
console.log(`  ${"regla".padEnd(28)} ${"n".padStart(5)} ${"prima".padStart(7)} ${"ret/op".padStart(7)} ${"$/op".padStart(7)} ${"ciclos".padStart(6)} ${"$/año×1".padStart(8)} ${"ctr".padStart(4)} ${"$/año".padStart(9)}  ${"capital".padStart(8)}`);
const dinero = [];
for (const r of mejores) {
  const ciclos = 365 / r.diasPos;
  const dolarOp = r.primaDesv * r.retDesv;
  const nContr = Math.max(1, Math.floor((CUENTA * 0.1) / r.primaDesv));
  const anual = dolarOp * ciclos * nContr;
  const nombre = `desvanecer ${r.lado === 1 ? "ASK" : "BID"}·${r.tipo}·≥$${(r.minPrem / 1e6).toFixed(2)}M·${r.k}d`;
  console.log(`  ${nombre.padEnd(28)} ${String(r.n).padStart(5)} $${fmt(r.primaDesv).padStart(6)} ${(100 * r.retDesv).toFixed(1).padStart(6)}% $${fmt(dolarOp).padStart(6)} ${ciclos.toFixed(1).padStart(6)} $${fmt(dolarOp * ciclos).padStart(7)} ${String(nContr).padStart(4)} $${fmt(anual).padStart(8)}  $${fmt(nContr * r.primaDesv).padStart(7)}`);
  dinero.push({ nombre, n: r.n, prima: r.primaDesv, ret: r.retDesv, dolarOp, ciclos, nContr, anual, capital: nContr * r.primaDesv, tDia: r.tDia });
}
console.log(`\n  Referencia: el 10% de la cuenta en SPY con su rentabilidad histórica da $${fmt(CUENTA * 0.1 * 0.14)}/año.`);
console.log(`  Y el vehículo sin señal (media de las dos patas) pierde ${(100 * media([...pool.get(5).values()].flat().map((x) => x.mm))).toFixed(2)}% por operación a 5 días.`);

// ── 8. ¿CUÁNTA MUESTRA FALTA? ───────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(106)}`);
console.log(`CUÁNTO FALTA — la t crece con la raíz de los DÍAS, no de las filas`);
console.log(`${"═".repeat(106)}\n`);
for (const { r, v } of veredictos) {
  const faltan = Math.ceil(v.nDias * ((LISTON / Math.abs(v.t)) ** 2 - 1));
  console.log(`  ${(r.lado === 1 ? "ASK" : "BID")}·${r.tipo}·≥$${(r.minPrem / 1e6).toFixed(2)}M·${r.k}d : t=${v.t.toFixed(2)} con ${v.nDias} días de flujo` +
    (Math.abs(v.t) >= LISTON ? `  → YA cruza el listón` : `  → para llegar a ${LISTON} harían falta ~${faltan} días de mercado MÁS (${(faltan / 21).toFixed(1)} meses)`));
}

writeFileSync("scripts/print-3-desvanecer.json", JSON.stringify({
  liston: LISTON, pruebas: PRUEBAS,
  tabla: tabla.map(({ filas, ...r }) => r),
  dinero,
}, null, 1));
console.log(`\n  → scripts/print-3-desvanecer.json\n`);
