// SEGUIR EL PRINT · 2 — EL CONTROL BIEN HECHO.
//
// ═══ EL FALLO QUE ESTE PASE ARREGLA ═════════════════════════════════════════════════════════
//
// En el pase 1 el control era "la misma esquina con la dirección echada a suertes", que es la
// media de las dos patas: azar = (retC + retP)/2. Eso quita el PEAJE, pero NO quita la DERIVA.
//
// Con ese control, la diferencia contra el azar es exactamente  dir × (retC − retP)/2. Y si el
// mercado sube durante los 4 meses de muestra, (retC − retP) es positivo en casi TODOS los
// (ticker, día). Entonces una regla que diga "compra calls" sale con ventaja sin haber elegido
// nada: sale con ventaja porque el mercado subió. El pase 1 daba +6,0% (t=2,54) a "seguir al ASK"
// a 23 días, y "seguir al BID" daba −4,1%: los dos son la misma frase — "hubo más calls" — dicha
// dos veces.
//
// Aquí se mide contra tres listones, no contra uno:
//   A. BRUTO           dir × g,  g = (retC − retP)/2   ← lo que Lester cobra frente a una moneda
//   B. NEUTRAL         dir × (g − ĝ(día)),  ĝ(día) = media de g de TODOS los tickers ese día
//                      ← ¿elige el TICKER que lo hace mejor que el mercado, o sólo va largo?
//   C. PERMUTACIÓN     se barajan las direcciones DENTRO DE CADA DÍA entre los (ticker, día)
//                      disponibles, 2.000 veces. Es el azar exacto con la misma deriva, la misma
//                      proporción de calls y el mismo calendario. Da un p-valor sin suponer nada.
//
// Y se dice SIEMPRE cuánta de la ventaja bruta es deriva: mediaDir × ĝ(pool).
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/print-2-contra-el-azar.mjs

import { writeFileSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";
import {
  cadena, cierres, diasDe, tickersConCadena, elegirEsquina, bidSalida, limpiarCache,
  dias, media, sd, tUna, pctl, fmt, rng, nEfectiva,
} from "./print-lib.mjs";
import { radiografia } from "../lib/radiografia.ts";
import { pasarBarrera, informe, potencia, comprobarDescarte, listonT } from "../lib/barreraHallazgos.ts";

const CUENTA = 56389;
const DIST = Number(process.env.DIST || 0.05), DTE_OBJ = 90, TOL_DTE = 25;
const SALIDAS = [5, 10, 23];
const PRIMAS = [250e3, 1e6, 2.5e6];
const PERM = Number(process.env.PERM || 2000);
const ASK = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const BID = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);

const conCad = tickersConCadena().filter((t) => cierres(t));
const diasPorTk = new Map(conCad.map((t) => [t, diasDe(t).filter((d) => d >= "20260422")]));
const setDias = new Map(conCad.map((t) => [t, new Set(diasPorTk.get(t))]));
const ULTIMO = [...diasPorTk.values()].flat().sort().pop() ?? "20260806";

console.log(`\n${"═".repeat(104)}`);
console.log(`SEGUIR EL PRINT · 2 — contra el azar DE VERDAD (bruto · neutral de mercado · permutación)`);
console.log(`${"═".repeat(104)}`);
console.log(`  ${conCad.length} tickers con cadena y cierres · último día ${ULTIMO} · esquina ${(DIST * 100).toFixed(0)}% fuera / ~${DTE_OBJ} días\n`);

// ── 1. PRINTS ───────────────────────────────────────────────────────────────────────────────
console.log(`## 1. Flujo, con la marca de PATA DE SPREAD (mismo ticker, mismo milisegundo, otro contrato)`);
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
      dia, dY, tk: q.raiz, tipo: q.tipo, K: q.strike, exp: q.exp,
      prem: o.premium, lado, patas: inst.get(k).size,
      dir: (q.tipo === "C" ? 1 : -1) * lado, et, dtePrint: dias(dY, q.exp),
      distPrint: o.asset_price > 0 ? (q.tipo === "C" ? q.strike / o.asset_price - 1 : 1 - q.strike / o.asset_price) : null,
    });
  }
}
console.log(`   ${fmt(leidos)} prints · ${fmt(eventos.length)} candidatos (ticker operable · 9:30-15:00 ET · lado definido · ≥$250k)`);
comprobarDescarte(leidos, eventos.length, "criba de admisión", 0.995);

// ── 2. LA REJILLA ───────────────────────────────────────────────────────────────────────────
console.log(`\n## 2. Esquina barata con precios reales para cada (ticker, día)`);
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
    rejilla.set(`${tk}|${dY}`, {
      exp: c.exp, askC: c.ask, askP: p.ask, ret,
      peaje: ((c.ask - c.bid) / c.ask + (p.ask - p.bid) / p.ask) / 2,
    });
  }
}
console.log(`   ${fmt(rejilla.size)} de ${fmt(intentos)} (ticker, día) con las dos patas y salida real (${((100 * rejilla.size) / intentos).toFixed(1)}%)`);

// EL POOL: para cada salida, todos los (ticker, día) que existen. De aquí sale ĝ(día) y de aquí
// se barajan las direcciones en la permutación. Es el "mismo mercado, otra elección".
const pool = new Map();          // k -> Map(dY -> [{tk, g, m}])
for (const k of SALIDAS) {
  const m = new Map();
  for (const [clave, r] of rejilla) {
    const rr = r.ret[k]; if (!rr) continue;
    const [tk, dY] = clave.split("|");
    if (!m.has(dY)) m.set(dY, []);
    m.get(dY).push({ tk, g: rr.g, mm: rr.m });
  }
  pool.set(k, m);
}
console.log(`\n   LA DERIVA DEL PERÍODO — ĝ(pool) = media de (retC − retP)/2 sobre TODOS los (ticker, día):`);
for (const k of SALIDAS) {
  const todos = [...pool.get(k).values()].flat();
  const g = todos.map((x) => x.g), mm = todos.map((x) => x.mm);
  const sube = g.filter((x) => x > 0).length / g.length;
  console.log(`     salida ${String(k).padStart(2)}d · n=${fmt(todos.length)} · ĝ = ${(100 * media(g)).toFixed(2).padStart(6)}%  (la call gana a la put en el ${(100 * sube).toFixed(1)}% de los casos)` +
              `  ·  coste del vehículo (media de las dos patas) ${(100 * media(mm)).toFixed(2)}%`);
}
console.log(`     → CUALQUIER regla con sesgo a calls hereda esa deriva sin haber elegido nada. Por eso el control neutral.`);

// ── 3. RADIOGRAFÍA ──────────────────────────────────────────────────────────────────────────
// `dir` NO entra aquí: es una etiqueta de ±1, no un predictor que ordene. La radiografía existe
// para cazar campos MUERTOS entre los que se usan para ordenar, y con 2 valores siempre lanzaría.
radiografia(eventos.slice(0, 150000), ["prem", "patas", "et", "dtePrint"], "prints candidatos", { minDistintos: 3 });
{
  const d = eventos.filter((e) => e.dir === 1).length / eventos.length;
  console.log(`  dir: ${(100 * d).toFixed(1)}% alcistas · ${(100 * (1 - d)).toFixed(1)}% bajistas (etiqueta ±1, no se radiografía)\n`);
}

// ── 4. REGLAS declaradas antes de mirar ─────────────────────────────────────────────────────
const REGLAS = [];
for (const soloSueltos of [true, false])
  for (const lado of [1, -1])
    for (const minPrem of PRIMAS)
      REGLAS.push({ nombre: `${soloSueltos ? "SUELTO" : "todos "}·${lado === 1 ? "ASK" : "BID"}·≥$${(minPrem / 1e6).toFixed(2)}M`, soloSueltos, lado, minPrem });
const PRUEBAS = REGLAS.length * SALIDAS.length;
const LISTON = listonT(PRUEBAS);
console.log(`\n## 3. ${PRUEBAS} pruebas declaradas · listón |t| ≥ ${LISTON}\n`);

function entradas(regla) {
  const mejor = new Map();
  for (const e of eventos) {
    if (regla.soloSueltos && e.patas !== 1) continue;
    if (e.lado !== regla.lado || e.prem < regla.minPrem) continue;
    const k = `${e.tk}|${e.dY}`;
    if (!rejilla.has(k)) continue;
    const a = mejor.get(k);
    if (!a || e.prem > a.prem) mejor.set(k, e);
  }
  return [...mejor.values()];
}

// ── 5. MEDIR ────────────────────────────────────────────────────────────────────────────────
const resultados = [];
for (const regla of REGLAS) {
  const ent = entradas(regla);
  for (const k of SALIDAS) {
    const porDia = pool.get(k);
    const filas = [];
    for (const e of ent) {
      const rr = rejilla.get(`${e.tk}|${e.dY}`)?.ret[k];
      if (!rr) continue;
      const dia = porDia.get(e.dY) ?? [];
      const gDia = media(dia.map((x) => x.g));                 // el mercado de ESE día en la esquina
      filas.push({
        ticker: e.tk, fecha: e.dia, fechaY: e.dY, dir: e.dir,
        bruto: e.dir * rr.g,                                   // ventaja frente a la moneda
        neutral: e.dir * (rr.g - gDia),                        // ventaja frente al mercado de ese día
        pnl: e.dir === 1 ? rr.C : rr.P,
        prima: (e.dir === 1 ? rejilla.get(`${e.tk}|${e.dY}`).askC : rejilla.get(`${e.tk}|${e.dY}`).askP) * 100,
        diasPos: rr.diasPos, acierta: e.dir * rr.g > 0,
      });
    }
    if (filas.length < 50) { resultados.push({ regla: regla.nombre, k, n: filas.length, vacio: true }); continue; }

    // ── PERMUTACIÓN: mismo día, mismo nº de apuestas, MISMA proporción de calls, otro ticker.
    // Se conserva la dirección de cada apuesta y se le asigna un ticker sorteado de los que
    // cotizaban ESE día. Así el azar arrastra exactamente la misma deriva de mercado.
    const azar = rng(20260820);
    const porDiaFilas = new Map();
    for (const f of filas) { if (!porDiaFilas.has(f.fechaY)) porDiaFilas.set(f.fechaY, []); porDiaFilas.get(f.fechaY).push(f.dir); }
    const nulos = [];
    for (let it = 0; it < PERM; it++) {
      let s = 0, n = 0;
      for (const [dY, dirs] of porDiaFilas) {
        const cand = porDia.get(dY);
        if (!cand || !cand.length) continue;
        const gDia = media(cand.map((x) => x.g));
        for (const d of dirs) { const x = cand[Math.floor(azar() * cand.length)]; s += d * (x.g - 0); n++; }
        void gDia;
      }
      if (n) nulos.push(s / n);
    }
    const mBruto = media(filas.map((f) => f.bruto));
    const mNul = media(nulos), sNul = sd(nulos);
    const z = sNul > 0 ? (mBruto - mNul) / sNul : 0;
    const p = (nulos.filter((x) => Math.abs(x - mNul) >= Math.abs(mBruto - mNul)).length + 1) / (nulos.length + 1);

    const ne = nEfectiva(filas, k);
    const tks = new Map();
    for (const f of filas) tks.set(f.ticker, (tks.get(f.ticker) ?? 0) + 1);
    const may = [...tks.entries()].sort((a, b) => b[1] - a[1])[0];
    resultados.push({
      regla: regla.nombre, k, n: filas.length,
      bruto: mBruto, tBruto: tUna(filas.map((f) => f.bruto)),
      neutral: media(filas.map((f) => f.neutral)), tNeutral: tUna(filas.map((f) => f.neutral)),
      mediaDir: media(filas.map((f) => f.dir)),
      nulMedia: mNul, nulSd: sNul, z, p,
      acierto: filas.filter((f) => f.acierta).length / filas.length,
      nEfTk: ne.porTicker, nEfVent: ne.ventanas,
      mayor: may ? { t: may[0], pct: may[1] / filas.length } : null,
      prima: media(filas.map((f) => f.prima)), diasPos: media(filas.map((f) => f.diasPos)),
      ret: media(filas.map((f) => f.pnl)),
      filas,
    });
  }
}

console.log(`  ${"regla".padEnd(22)} ${"sal".padStart(3)} ${"n".padStart(5)} ${"nEf".padStart(4)} ${"vt".padStart(3)}  ${"dirMed".padStart(6)}  ${"BRUTO".padStart(7)} ${"t".padStart(5)}  ${"NEUTRAL".padStart(7)} ${"t".padStart(5)}  ${"z perm".padStart(6)} ${"p".padStart(6)}  ${"acierto".padStart(7)}  mayor`);
for (const r of resultados) {
  if (r.vacio) { console.log(`  ${r.regla.padEnd(22)} ${String(r.k).padStart(3)} ${String(r.n).padStart(5)}   — muestra corta`); continue; }
  const m = Math.abs(r.tNeutral) >= LISTON ? " ◄" : "";
  console.log(`  ${r.regla.padEnd(22)} ${String(r.k).padStart(3)} ${String(r.n).padStart(5)} ${String(r.nEfTk).padStart(4)} ${String(r.nEfVent).padStart(3)}  ${r.mediaDir.toFixed(2).padStart(6)}  ` +
    `${(100 * r.bruto).toFixed(2).padStart(6)}% ${r.tBruto.toFixed(2).padStart(5)}  ${(100 * r.neutral).toFixed(2).padStart(6)}% ${r.tNeutral.toFixed(2).padStart(5)}  ` +
    `${r.z.toFixed(2).padStart(6)} ${r.p.toFixed(3).padStart(6)}  ${(100 * r.acierto).toFixed(1).padStart(6)}%  ${r.mayor.t} ${(100 * r.mayor.pct).toFixed(0)}%${m}`);
}

// ── 6. CUÁNTO DE LO BRUTO ES DERIVA ─────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(104)}`);
console.log(`DESCOMPOSICIÓN — ¿ventaja o deriva?`);
console.log(`${"═".repeat(104)}\n`);
console.log(`  ${"regla".padEnd(22)} ${"sal".padStart(3)}  ${"bruto".padStart(7)} = ${"deriva".padStart(7)} + ${"selección".padStart(9)}   (deriva = dirMedia × ĝ del pool)`);
for (const r of resultados) {
  if (r.vacio) continue;
  const todos = [...pool.get(r.k).values()].flat();
  const gPool = media(todos.map((x) => x.g));
  const deriva = r.mediaDir * gPool;
  console.log(`  ${r.regla.padEnd(22)} ${String(r.k).padStart(3)}  ${(100 * r.bruto).toFixed(2).padStart(6)}% = ${(100 * deriva).toFixed(2).padStart(6)}% + ${(100 * (r.bruto - deriva)).toFixed(2).padStart(8)}%`);
}

// ── 7. LA BARRERA ───────────────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(104)}`);
console.log(`LA BARRERA — sobre la ventaja NEUTRAL (la bruta la contamina la deriva)`);
console.log(`${"═".repeat(104)}`);
const cand = resultados.filter((r) => !r.vacio && Math.abs(r.tNeutral) >= LISTON).sort((a, b) => Math.abs(b.tNeutral) - Math.abs(a.tNeutral));
if (!cand.length) {
  console.log(`\n  Ninguna de las ${PRUEBAS} pruebas llega al listón |t| ≥ ${LISTON} en la ventaja neutral.`);
  const mej = resultados.filter((r) => !r.vacio).sort((a, b) => Math.abs(b.tNeutral) - Math.abs(a.tNeutral)).slice(0, 3);
  for (const m of mej) console.log(`  La más alta: ${m.regla} salida ${m.k}d · neutral ${(100 * m.neutral).toFixed(2)}% · t=${m.tNeutral.toFixed(2)} · p permutación ${m.p.toFixed(3)}`);
} else {
  for (const c of cand.slice(0, 5)) console.log(`\n${informe(pasarBarrera(c.filas, (f) => f.neutral, { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 }), `${c.regla} · ${c.k}d`)}`);
}

// ── 8. POTENCIA ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(104)}`);
console.log(`POTENCIA — ¿podía la muestra ver una ventaja que valga dinero?`);
console.log(`${"═".repeat(104)}\n`);
const EFECTO = 0.029;              // pasar del 50% al 52,8% de acierto vale ~2,9 puntos por operación
for (const k of SALIDAS) {
  const r = resultados.filter((x) => !x.vacio && x.k === k).sort((a, b) => b.n - a.n)[0];
  if (!r) continue;
  const p = potencia(r.filas.map((f) => ({ pnl: f.neutral, ticker: f.ticker, fecha: f.fecha })), EFECTO);
  console.log(`  ${String(k).padStart(2)}d · ${r.regla} · n=${r.n} (nEf ${r.nEfTk}, ${r.nEfVent} ventanas de calendario)`);
  console.log(`      ${p.mensaje}\n`);
}

writeFileSync("scripts/print-2-contra-el-azar.json", JSON.stringify({
  liston: LISTON, pruebas: PRUEBAS, dist: DIST,
  resultados: resultados.map(({ filas, ...r }) => r),
}, null, 1));
console.log(`  → scripts/print-2-contra-el-azar.json\n`);
