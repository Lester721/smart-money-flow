// AUDITORÍA DE CONCENTRACIÓN — ¿el 24,58x es una señal o son tres operaciones?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/auditc-concentracion.mjs
//
// Replica EXACTAMENTE la mecánica de scripts/cartera-cesta.mjs con MODO=enteros, pero en vez de
// imprimir un múltiplo agregado guarda CADA PATA con su coste y su cobro, para poder preguntar:
//
//   · cuánto aporta cada TICKER y cada AÑO DE ENTRADA a la ganancia neta
//   · qué queda del múltiplo si se quita el ticker que más aporta (y los dos mayores)
//   · qué queda si se quitan 2019 y 2025 enteros
//   · cuántas patas distintas producen el 50% de la ganancia
//
// DOS FORMAS DE QUITAR, y las dos se reportan porque dicen cosas distintas:
//   (a) TIJERA   — se borran las patas de ese ticker/año del resultado ya calculado. Contesta
//                  "¿de dónde salió el dinero?". Es contabilidad, no una estrategia alternativa.
//   (b) RE-ELECCIÓN — el ticker se saca del UNIVERSO y cada mes se vuelven a elegir las 3 mejores
//                  de las 27 restantes. Contesta "¿habría funcionado sin ese nombre?". Es la
//                  pregunta honesta, porque el hueco lo llena otro candidato.
//
// El listón sigue siendo el CONTROL AL AZAR con la misma semilla y las mismas exclusiones.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { radiografia } from "../lib/radiografia";

const CDIR = "scripts/cache-theta/cadenas";
const POR_TICKER = Number(process.env.POR_TICKER || 500);
const N_TICKERS = Number(process.env.N_TICKERS || 3);
const OTM_MIN = 60, DTE_MIN = 365;
const ASK_MIN = 0.10, SPREAD_MAX = 0.40;
const MODO = "enteros";                       // el modo que hay que romper
const ms = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();

const cache = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  const hit = cache.get(k);
  if (hit !== undefined) { cache.delete(k); cache.set(k, hit); return hit; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cache.set(k, v);
  if (cache.size > 250) cache.delete(cache.keys().next().value);
  return v;
}
function spotDe(c) {
  let k = null, dm = Infinity;
  for (const g of Object.values(c)) for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`];
    if (!p) continue;
    const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; k = K; }
  }
  return k;
}
function idxVenc(sym, exp) {
  const dias = diasPorSim.get(sym) ?? [];
  if (!dias.length || exp > dias[dias.length - 1]) return -1;
  let lo = 0, hi = dias.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dias[m] <= exp) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}

function cesta(sym, dia) {
  const c = cadena(sym, dia);
  if (!c) return null;
  const sp = spotDe(c);
  if (!sp) return null;
  const patas = [];
  for (const [exp, g] of Object.entries(c)) {
    const dte = Math.round((ms(exp) - ms(dia)) / 86_400_000);
    if (dte <= DTE_MIN) continue;
    const iu = idxVenc(sym, exp);
    if (iu < 0) continue;
    const dSal = (diasPorSim.get(sym) ?? [])[iu];
    const gSal = cadena(sym, dSal)?.[exp] ?? {};
    for (const [clave, ba] of Object.entries(g)) {
      if (clave.slice(-1) !== "C") continue;
      const K = Number(clave.slice(0, -2));
      const otm = ((K - sp) / sp) * 100;
      if (otm <= OTM_MIN) continue;
      const [bid, ask] = ba;
      if (!(ask >= ASK_MIN) || !((ask - bid) / ask <= SPREAD_MAX)) continue;
      const salLarga = gSal[clave];
      const valorDesnuda = salLarga ? salLarga[0] : 0;
      patas.push({ exp, K, otm, ask, valorDesnuda });
    }
  }
  return patas.length ? patas : null;
}

// ── memo: las COMPRAS (contratos enteros, del más barato al más caro) de cada (ticker, mes) ──
const memo = new Map();
const ultimoDiaDelMes = (sym, mes) => {
  const d = (diasPorSim.get(sym) ?? []).filter((x) => x.slice(0, 6) === mes);
  return d.length ? d[d.length - 1] : null;
};
function comprasDe(sym, mes) {
  const k = `${sym}|${mes}`;
  if (memo.has(k)) return memo.get(k);
  let out = null;
  const dia = ultimoDiaDelMes(sym, mes);
  if (dia) {
    const patas = cesta(sym, dia);
    if (patas) {
      const orden = [...patas].sort((x, y) => x.ask - y.ask);
      out = [];
      let queda = POR_TICKER;
      for (const p of orden) {
        const coste = p.ask * 100;
        if (coste > queda) continue;
        queda -= coste;
        out.push({ exp: p.exp, K: p.K, otm: p.otm, gasto: coste, cobro: p.valorDesnuda * 100 });
      }
      if (!out.length) out = null;
    }
  }
  memo.set(k, out);
  return out;
}

// ── señales ─────────────────────────────────────────────────────────────────
const filas = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8")).filter((x) => x.gamLejos != null);
radiografia(filas, ["gamLejos", "resultado"], "señales", { cerosLegitimos: ["resultado"] });
const porMes = new Map();
for (const f of filas) { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(f); }
const MESES = [...porMes.keys()].sort();

/**
 * Corre la simulación devolviendo LAS PATAS, no un agregado.
 * @param regla "filtro" | "azar"
 * @param excTickers Set de tickers fuera del UNIVERSO (re-elección)
 * @param excAños Set de años de entrada excluidos
 */
function patasDe(regla, excTickers = new Set(), excAños = new Set()) {
  let semilla = 42;                                   // misma semilla que el original
  const azar = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
  const out = [];
  for (const mes of MESES) {
    if (excAños.has(mes.slice(0, 4))) continue;
    const delMes = porMes.get(mes).filter((x) => !excTickers.has(x.ticker));
    if (!delMes.length) continue;
    let elegidos;
    if (regla === "azar") {
      const copia = [...delMes];
      elegidos = [];
      for (let i = 0; i < N_TICKERS && copia.length; i++) elegidos.push(copia.splice(Math.floor(azar() * copia.length), 1)[0]);
    } else elegidos = [...delMes].sort((a, b) => b.gamLejos - a.gamLejos).slice(0, N_TICKERS);
    for (const e of elegidos) {
      const compras = comprasDe(e.ticker, mes);
      if (!compras) continue;
      for (const c of compras) out.push({ ticker: e.ticker, mes, año: mes.slice(0, 4), ...c });
    }
  }
  return out;
}

const inv = (P) => P.reduce((a, x) => a + x.gasto, 0);
const rec = (P) => P.reduce((a, x) => a + x.cobro, 0);
const mult = (P) => (inv(P) ? rec(P) / inv(P) : NaN);
const eur = (x) => `$${Math.round(x).toLocaleString("es-ES")}`;
const pct = (x) => `${(x * 100).toFixed(1)}%`;

console.log("\n═══ AUDITORÍA DE CONCENTRACIÓN · MODO=enteros · filtro · call desnuda ═══\n");

const BASE = patasDe("filtro");
const CTRL = patasDe("azar");
const gTot = rec(BASE) - inv(BASE);
console.log(`BASE filtro : ${BASE.length} patas · ${eur(inv(BASE))} → ${eur(rec(BASE))} = ${mult(BASE).toFixed(2)}x · ganancia neta ${eur(gTot)}`);
console.log(`BASE control: ${CTRL.length} patas · ${eur(inv(CTRL))} → ${eur(rec(CTRL))} = ${mult(CTRL).toFixed(2)}x`);
const entradas = new Set(BASE.map((x) => `${x.ticker}|${x.mes}`));
console.log(`entradas (ticker,mes) distintas: ${entradas.size} · tickers distintos: ${new Set(BASE.map((x) => x.ticker)).size}\n`);

// ── 1. reparto por TICKER ───────────────────────────────────────────────────
function agrupa(P, clave) {
  const m = new Map();
  for (const x of P) {
    const k = clave(x);
    if (!m.has(k)) m.set(k, { inv: 0, rec: 0, n: 0, entradas: new Set() });
    const a = m.get(k); a.inv += x.gasto; a.rec += x.cobro; a.n++; a.entradas.add(`${x.ticker}|${x.mes}`);
  }
  return [...m].map(([k, a]) => ({ k, ...a, gan: a.rec - a.inv, mult: a.rec / a.inv }))
               .sort((a, b) => b.gan - a.gan);
}

console.log("── 1a. REPARTO POR TICKER (ganancia neta = cobro − coste) ──");
const porTk = agrupa(BASE, (x) => x.ticker);
console.log("   ticker  entr  patas    invertido      cobrado      mult      ganancia   % de la ganancia total");
for (const r of porTk)
  console.log(`   ${r.k.padEnd(6)} ${String(r.entradas.size).padStart(5)} ${String(r.n).padStart(6)} ${eur(r.inv).padStart(12)} ${eur(r.rec).padStart(12)} ${r.mult.toFixed(2).padStart(8)}x ${eur(r.gan).padStart(13)}   ${pct(r.gan / gTot).padStart(8)}`);

console.log("\n── 1b. REPARTO POR AÑO DE ENTRADA ──");
const porAño = agrupa(BASE, (x) => x.año);
console.log("   año    entr  patas    invertido      cobrado      mult      ganancia   % de la ganancia total");
for (const r of [...porAño].sort((a, b) => a.k.localeCompare(b.k)))
  console.log(`   ${r.k.padEnd(6)} ${String(r.entradas.size).padStart(5)} ${String(r.n).padStart(6)} ${eur(r.inv).padStart(12)} ${eur(r.rec).padStart(12)} ${r.mult.toFixed(2).padStart(8)}x ${eur(r.gan).padStart(13)}   ${pct(r.gan / gTot).padStart(8)}`);
const mayorAño = [...porAño].sort((a, b) => b.gan - a.gan)[0];
console.log(`   → el año que más aporta: ${mayorAño.k} con ${pct(mayorAño.gan / gTot)} de la ganancia`);

console.log("\n── 1c. REPARTO POR (TICKER, AÑO) — los 12 mayores ──");
for (const r of agrupa(BASE, (x) => `${x.ticker} ${x.año}`).slice(0, 12))
  console.log(`   ${r.k.padEnd(12)} ${String(r.n).padStart(5)} patas · ${eur(r.gan).padStart(13)}   ${pct(r.gan / gTot).padStart(8)}`);

// ── 2. quitar tickers ───────────────────────────────────────────────────────
console.log("\n── 2. QUÉ QUEDA SI SE QUITAN TICKERS ──");
const t1 = porTk[0].k, t2 = porTk[1].k;
function informe(nombre, excT, excA) {
  const tij = BASE.filter((x) => !excT.has(x.ticker) && !excA.has(x.año));
  const re = patasDe("filtro", excT, excA);
  const rc = patasDe("azar", excT, excA);
  console.log(`   ${nombre}`);
  console.log(`      tijera      : ${String(tij.length).padStart(5)} patas · ${eur(inv(tij)).padStart(11)} → ${eur(rec(tij)).padStart(12)} = ${mult(tij).toFixed(2)}x`);
  console.log(`      re-elección : ${String(re.length).padStart(5)} patas · ${eur(inv(re)).padStart(11)} → ${eur(rec(re)).padStart(12)} = ${mult(re).toFixed(2)}x`);
  console.log(`      control azar: ${String(rc.length).padStart(5)} patas · ${eur(inv(rc)).padStart(11)} → ${eur(rec(rc)).padStart(12)} = ${mult(rc).toFixed(2)}x`);
  console.log(`      → filtro/control = ${(mult(re) / mult(rc)).toFixed(2)}\n`);
  return { re: mult(re), rc: mult(rc), tij: mult(tij) };
}
console.log(`   (referencia sin quitar nada: filtro ${mult(BASE).toFixed(2)}x · control ${mult(CTRL).toFixed(2)}x · ratio ${(mult(BASE) / mult(CTRL)).toFixed(2)})\n`);
informe(`sin ${t1}`, new Set([t1]), new Set());
informe(`sin ${t1} y ${t2}`, new Set([t1, t2]), new Set());

// ── 3. quitar años ──────────────────────────────────────────────────────────
console.log("── 3. QUÉ QUEDA SI SE QUITAN AÑOS ENTEROS ──");
informe("sin 2019 y 2025", new Set(), new Set(["2019", "2025"]));
informe("sin 2019", new Set(), new Set(["2019"]));
informe("sin 2025", new Set(), new Set(["2025"]));
informe(`sin ${t1} y sin 2019/2025`, new Set([t1]), new Set(["2019", "2025"]));

// ── 4. cuántas patas hacen el 50% de la ganancia ────────────────────────────
console.log("── 4. CONCENTRACIÓN EN PATAS SUELTAS ──");
const ganPata = BASE.map((x) => ({ ...x, gan: x.cobro - x.gasto })).sort((a, b) => b.gan - a.gan);
let acum = 0, n50 = 0, n80 = 0, n90 = 0;
for (let i = 0; i < ganPata.length; i++) {
  acum += ganPata[i].gan;
  if (!n50 && acum >= 0.5 * gTot) n50 = i + 1;
  if (!n80 && acum >= 0.8 * gTot) n80 = i + 1;
  if (!n90 && acum >= 0.9 * gTot) n90 = i + 1;
}
const positivas = ganPata.filter((x) => x.gan > 0).length;
console.log(`   patas totales ${ganPata.length} · con ganancia > 0: ${positivas} (${pct(positivas / ganPata.length)})`);
console.log(`   patas necesarias para el 50% de la ganancia: ${n50}`);
console.log(`   patas necesarias para el 80%: ${n80} · para el 90%: ${n90}`);
const ent50 = new Set(ganPata.slice(0, n50).map((x) => `${x.ticker}|${x.mes}`));
console.log(`   esas ${n50} patas salen de ${ent50.size} entradas (ticker,mes) distintas: ${[...ent50].sort().join(", ")}`);

console.log("\n   las 15 patas más rentables:");
console.log("   ticker  mes     venc      strike   coste     cobro       ganancia   % del total");
for (const p of ganPata.slice(0, 15))
  console.log(`   ${p.ticker.padEnd(6)} ${p.mes}  ${p.exp}  ${String(p.K).padStart(7)} ${eur(p.gasto).padStart(8)} ${eur(p.cobro).padStart(11)} ${eur(p.gan).padStart(13)}   ${pct(p.gan / gTot).padStart(7)}`);

// ── 5. mismo ejercicio sobre el CONTROL, para saber si la concentración es del filtro ──
console.log("\n── 5. ¿EL CONTROL TAMBIÉN ESTÁ CONCENTRADO? ──");
const gCtrl = rec(CTRL) - inv(CTRL);
const cPata = CTRL.map((x) => x.cobro - x.gasto).sort((a, b) => b - a);
let ac = 0, c50 = 0;
for (let i = 0; i < cPata.length; i++) { ac += cPata[i]; if (!c50 && ac >= 0.5 * gCtrl) { c50 = i + 1; break; } }
console.log(`   control: ${CTRL.length} patas · ${c50} patas hacen el 50% de su ganancia`);
for (const r of agrupa(CTRL, (x) => x.ticker).slice(0, 5))
  console.log(`   control top ticker ${r.k.padEnd(6)} ${pct(r.gan / gCtrl).padStart(8)} de su ganancia`);

// ── 6. mediana de entradas: el múltiplo sin las colas ────────────────────────
console.log("\n── 6. LA ENTRADA TÍPICA (mediana), no la media ──");
function porEntrada(P) {
  const m = new Map();
  for (const x of P) {
    const k = `${x.ticker}|${x.mes}`;
    if (!m.has(k)) m.set(k, { inv: 0, rec: 0 });
    const a = m.get(k); a.inv += x.gasto; a.rec += x.cobro;
  }
  return [...m.values()].map((a) => a.rec / a.inv).sort((a, b) => a - b);
}
for (const [nom, P] of [["filtro", BASE], ["control", CTRL]]) {
  const v = porEntrada(P);
  const q = (f) => v[Math.min(v.length - 1, Math.floor(v.length * f))];
  console.log(`   ${nom.padEnd(8)} n=${v.length} · p25 ${q(0.25).toFixed(2)}x · MEDIANA ${q(0.5).toFixed(2)}x · p75 ${q(0.75).toFixed(2)}x · p90 ${q(0.9).toFixed(2)}x · max ${q(1).toFixed(2)}x`);
  console.log(`            entradas que acaban en CERO exacto: ${v.filter((x) => x === 0).length} de ${v.length}`);
}
