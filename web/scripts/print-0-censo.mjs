// SEGUIR EL PRINT · 0 — CENSO. Mirar el fichero ANTES de medirlo.
//
// Lo medido hasta hoy fueron los CAMPOS DE MS AGREGADOS POR (ticker, día). Once métricas, todas
// fallidas. Pero un operador no mira el promedio del día: ve UNA operación gigante entrar al ask
// y la sigue. La unidad natural es EL PRINT.
//
// Este pase no mide nada contra el futuro. Sólo abre los ficheros y contesta:
//   1. ¿se solapan flujo-100k y flujo-1000k? (si 1000k ⊂ 100k, medir los dos es medir dos veces)
//   2. ¿qué es `trade_condition_id`? — el campo que NADIE ha mirado. Si separa operación SIMPLE de
//      PATA DE UN SPREAD, cambia todo: una pata de cóndor al ask no es una apuesta direccional.
//   3. ¿cuántos prints son BARRIDOS? (mismo contrato, varios prints en segundos) — la señal
//      clásica de "unusual options activity", que agregar por día destruye.
//   4. el reparto por hora, plazo del contrato, distancia al dinero, tamaño relativo al volumen
//   5. concentración por ticker (SPX es el 34,5% de ≥$1M: sin tope, medir el flujo es medir SPX)
//   6. la ruptura del 2026-07-16 en asset_price
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/print-0-censo.mjs

import { readdirSync, writeFileSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";

const iso = (y) => `${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}`;
const dteDe = (exp, dia) => Math.round((Date.parse(iso(exp)) - Date.parse(dia)) / 864e5);
const maxDe = (v) => v.reduce((a, x) => (x > a ? x : a), -Infinity);
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const fmt = (n) => n.toLocaleString("es-ES");

const CDIR = "scripts/cache-theta/cadenas";
const conCadena = new Set(readdirSync(CDIR).map((f) => /^([A-Z]+)_d\d{8}\.json$/.exec(f)?.[1]).filter(Boolean));

console.log(`\n${"═".repeat(100)}`);
console.log(`SEGUIR EL PRINT · 0 — CENSO`);
console.log(`${"═".repeat(100)}`);

const diasA = diasFlujo("1000k"), diasB = diasFlujo("100k");
console.log(`\n  flujo-1000k: ${diasA.length} días · ${diasA[0]} → ${diasA[diasA.length - 1]}`);
console.log(`  flujo-100k : ${diasB.length} días · ${diasB[0]} → ${diasB[diasB.length - 1]}`);

// ── 1. ¿SE SOLAPAN LOS DOS NIVELES? ─────────────────────────────────────────────────────────
{
  const muestra = [diasA[0], diasA[Math.floor(diasA.length / 2)], diasA[diasA.length - 1]];
  console.log(`\n## 1. ¿flujo-1000k ⊂ flujo-100k?  (si sí, se usa SÓLO 100k y se filtra por premium)\n`);
  for (const d of muestra) {
    const a = leerDia(d, "1000k"), b = leerDia(d, "100k");
    const idsB = new Set(b.map((x) => x.id));
    const dentro = a.filter((x) => idsB.has(x.id)).length;
    const pMinA = Math.min(...a.map((x) => x.premium)), pMinB = Math.min(...b.map((x) => x.premium));
    console.log(`  ${d}  1000k=${String(a.length).padStart(5)}  100k=${String(b.length).padStart(6)}` +
                `  · ${dentro}/${a.length} de los 1000k están dentro de los 100k (${((100 * dentro) / a.length).toFixed(1)}%)` +
                `  · prima mínima: 1000k $${fmt(pMinA)} / 100k $${fmt(pMinB)}`);
  }
}

// ── CARGA ÚNICA ─────────────────────────────────────────────────────────────────────────────
// Se trabaja sobre flujo-100k (el superconjunto). Se guarda sólo lo necesario por print.
console.log(`\n## 2. Cargando flujo-100k …`);
const P = [];
let sinOCC = 0, total = 0;
const t0 = Date.now();
for (const dia of diasB) {
  for (const o of leerDia(dia, "100k")) {
    total++;
    const q = parseOCC(o.symbol);
    if (!q) { sinOCC++; continue; }
    P.push({
      dia, t: o.timestamp, tk: q.raiz, exp: q.exp, tipo: q.tipo, K: q.strike,
      prem: o.premium, size: o.size, price: o.price, vol: o.volume, oi: o.open_interest,
      side: o.side, cond: o.trade_condition_id, exch: o.exchange_id, S: o.asset_price,
      delta: o.delta, iv: o.implied_volatility, score: o.score, sent: o.sentiment,
      bid: o.bid_price, ask: o.ask_price,
    });
  }
}
console.log(`   ${fmt(total)} prints leídos en ${((Date.now() - t0) / 1000).toFixed(0)}s · ${fmt(sinOCC)} con símbolo no OCC (${((100 * sinOCC) / total).toFixed(2)}%) · ${fmt(P.length)} utilizables`);

// ── 3. trade_condition_id — EL CAMPO QUE NADIE HA MIRADO ────────────────────────────────────
console.log(`\n## 3. trade_condition_id — ¿separa operación SIMPLE de PATA DE SPREAD?\n`);
{
  const m = new Map();
  for (const p of P) {
    const k = p.cond ?? "null";
    if (!m.has(k)) m.set(k, { n: 0, prem: 0, side: new Map(), tk: new Set(), sizes: [] });
    const a = m.get(k); a.n++; a.prem += p.prem; a.side.set(p.side, (a.side.get(p.side) ?? 0) + 1);
    if (a.tk.size < 500) a.tk.add(p.tk);
    if (a.sizes.length < 20000) a.sizes.push(p.size);
  }
  const filas = [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  console.log(`  ${"cond".padStart(6)} ${"n".padStart(9)} ${"%".padStart(6)}  ${"prima total".padStart(14)}  ${"size p50".padStart(8)}  lado dominante`);
  for (const [k, a] of filas.slice(0, 20)) {
    const ld = [...a.side.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3)
      .map(([s, n]) => `${s} ${((100 * n) / a.n).toFixed(0)}%`).join(" · ");
    console.log(`  ${String(k).padStart(6)} ${fmt(a.n).padStart(9)} ${((100 * a.n) / P.length).toFixed(2).padStart(5)}%  $${fmt(Math.round(a.prem)).padStart(13)}  ${String(pctl(a.sizes, 0.5)).padStart(8)}  ${ld}`);
  }
  console.log(`\n   (${filas.length} valores distintos en total)`);
}

// ── 3b. ¿PATA DE SPREAD? LA PRUEBA DEFINITIVA: EL COMPAÑERO AL MISMO MILISEGUNDO ────────────
//
// Un spread (vertical, cóndor, calendar…) imprime TODAS sus patas en el MISMO instante y bajo el
// MISMO ticker, en contratos distintos. No hay que adivinar qué significa cada `trade_condition_id`:
// se mira si el print tiene compañeros a su mismo milisegundo. Si los tiene, NO es una apuesta
// direccional simple aunque entre "al ask" — es una pata, y su lado no significa lo que parece.
console.log(`\n## 3b. ¿Es el print una PATA de spread? — compañeros en el MISMO milisegundo\n`);
const esPata = new Map();          // clave del print -> nº de patas del grupo
{
  const g = new Map();
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    const k = `${p.tk}|${p.t}`;                       // mismo subyacente, mismo milisegundo
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(i);
  }
  let sueltos = 0, enGrupo = 0;
  const tam = [];
  for (const idx of g.values()) {
    // distintos CONTRATOS en el mismo instante = patas. Mismo contrato = trozos de un barrido.
    const contratos = new Set(idx.map((i) => `${P[i].exp}|${P[i].tipo}|${P[i].K}`));
    const n = contratos.size;
    for (const i of idx) P[i].patas = n;
    if (n === 1) sueltos += idx.length; else { enGrupo += idx.length; tam.push(n); }
  }
  console.log(`   ${fmt(g.size)} instantes (ticker, milisegundo) distintos`);
  console.log(`   prints SUELTOS (único contrato en su instante): ${fmt(sueltos)} (${((100 * sueltos) / P.length).toFixed(1)}%)`);
  console.log(`   prints que son PATA de un grupo multi-contrato : ${fmt(enGrupo)} (${((100 * enGrupo) / P.length).toFixed(1)}%) · patas por grupo p50 ${pctl(tam, 0.5)} · p90 ${pctl(tam, 0.9)} · max ${maxDe(tam)}`);
  console.log(`\n   reparto de patas por trade_condition_id (¿el campo lo estaba diciendo?):`);
  const m = new Map();
  for (const p of P) {
    const k = p.cond ?? "null";
    if (!m.has(k)) m.set(k, { n: 0, pata: 0, ask: 0, fuera: 0 });
    const a = m.get(k); a.n++;
    if (p.patas > 1) a.pata++;
    if (/ASK/.test(p.side)) a.ask++;
    if (p.side === "ABOVE_ASK" || p.side === "BELOW_BID") a.fuera++;
  }
  console.log(`   ${"cond".padStart(6)} ${"n".padStart(9)}  ${"% PATA".padStart(7)}  ${"% al ask".padStart(8)}  ${"% fuera del NBBO".padStart(16)}`);
  for (const [k, a] of [...m.entries()].sort((x, y) => y[1].n - x[1].n).slice(0, 14))
    console.log(`   ${String(k).padStart(6)} ${fmt(a.n).padStart(9)}  ${((100 * a.pata) / a.n).toFixed(1).padStart(6)}%  ${((100 * a.ask) / a.n).toFixed(1).padStart(7)}%  ${((100 * a.fuera) / a.n).toFixed(1).padStart(15)}%`);
}

// ── 4. BARRIDOS: mismo contrato, varios prints seguidos ─────────────────────────────────────
console.log(`\n## 4. BARRIDOS — mismo contrato, varios prints en la misma ventana de segundos\n`);
{
  // agrupar por (día, contrato)
  const g = new Map();
  for (const p of P) {
    const k = `${p.dia}|${p.tk}|${p.exp}|${p.tipo}|${p.K}`;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(p);
  }
  const reps = [...g.values()].map((v) => v.length);
  console.log(`   ${fmt(g.size)} pares (día, contrato) distintos · prints por par: p50 ${pctl(reps, 0.5)} · p90 ${pctl(reps, 0.9)} · p99 ${pctl(reps, 0.99)} · max ${maxDe(reps)}`);
  // ráfagas: prints del mismo contrato dentro de 30 s
  let rafagas = 0, printsEnRafaga = 0;
  const tamRafaga = [], primaRafaga = [];
  for (const v of g.values()) {
    if (v.length < 2) continue;
    v.sort((a, b) => a.t.localeCompare(b.t));
    let ini = 0;
    for (let i = 1; i <= v.length; i++) {
      const corta = i === v.length || Date.parse(v[i].t) - Date.parse(v[i - 1].t) > 30_000;
      if (corta) {
        const n = i - ini;
        if (n >= 3) {
          rafagas++; printsEnRafaga += n; tamRafaga.push(n);
          primaRafaga.push(v.slice(ini, i).reduce((a, x) => a + x.prem, 0));
        }
        ini = i;
      }
    }
  }
  console.log(`   ráfagas de ≥3 prints del MISMO contrato en ≤30 s: ${fmt(rafagas)} · ${fmt(printsEnRafaga)} prints dentro (${((100 * printsEnRafaga) / P.length).toFixed(1)}% del total)`);
  if (tamRafaga.length) console.log(`   tamaño de ráfaga: p50 ${pctl(tamRafaga, 0.5)} · p90 ${pctl(tamRafaga, 0.9)} · max ${maxDe(tamRafaga)} · prima de la ráfaga p50 $${fmt(Math.round(pctl(primaRafaga, 0.5)))} · p90 $${fmt(Math.round(pctl(primaRafaga, 0.9)))}`);
}

// ── 5. REPARTOS ─────────────────────────────────────────────────────────────────────────────
console.log(`\n## 5. De qué está hecho el flujo\n`);
{
  const tab = (nombre, f, orden = null) => {
    const m = new Map();
    for (const p of P) { const k = f(p); if (k == null) continue; m.set(k, (m.get(k) ?? 0) + 1); }
    const e = [...m.entries()].sort(orden ?? ((a, b) => b[1] - a[1]));
    console.log(`  ${nombre}`);
    for (const [k, n] of e.slice(0, 14)) console.log(`     ${String(k).padEnd(14)} ${fmt(n).padStart(9)}  ${((100 * n) / P.length).toFixed(2).padStart(5)}%`);
    if (e.length > 14) console.log(`     … y ${e.length - 14} más`);
    console.log("");
    return e;
  };
  const eTk = tab("por TICKER (top 14)", (p) => p.tk);
  const conCad = eTk.filter(([t]) => conCadena.has(t)).reduce((a, [, n]) => a + n, 0);
  console.log(`     → con cadena en disco HOY: ${((100 * conCad) / P.length).toFixed(1)}% de los prints (${conCadena.size} tickers)\n`);
  tab("por LADO", (p) => p.side);
  tab("por HORA (ET)", (p) => String(Number(p.t.slice(11, 13)) - 4).padStart(2, "0") + ":00", (a, b) => a[0].localeCompare(b[0]));
  tab("por PLAZO del contrato (DTE)", (p) => { const d = dteDe(p.exp, p.dia); return d < 0 ? null : d <= 2 ? "0-2" : d <= 7 ? "3-7" : d <= 21 ? "8-21" : d <= 45 ? "22-45" : d <= 120 ? "46-120" : d <= 365 ? "121-365" : ">365"; });
  tab("por PRIMA del print", (p) => p.prem < 250e3 ? "100-250k" : p.prem < 500e3 ? "250-500k" : p.prem < 1e6 ? "0,5-1M" : p.prem < 2.5e6 ? "1-2,5M" : p.prem < 5e6 ? "2,5-5M" : ">5M");
  const conS = P.filter((p) => p.S > 0);
  console.log(`  asset_price utilizable: ${fmt(conS.length)} de ${fmt(P.length)} (${((100 * conS.length) / P.length).toFixed(1)}%)`);
  for (const tr of ["antes", "despues"]) {
    const g = P.filter((p) => (p.dia < "2026-07-16" ? "antes" : "despues") === tr);
    const ok = g.filter((p) => p.S > 0).length;
    console.log(`     ${tr.padEnd(8)} ${fmt(g.length).padStart(9)} prints · ${((100 * ok) / g.length).toFixed(1)}% con asset_price`);
  }
  // distancia al dinero (sólo donde hay asset_price)
  const dist = conS.map((p) => (p.tipo === "C" ? p.K / p.S - 1 : 1 - p.K / p.S));
  console.log(`\n  distancia al dinero del CONTRATO DEL PRINT (+ = fuera): p10 ${(100 * pctl(dist, 0.1)).toFixed(1)}% · p50 ${(100 * pctl(dist, 0.5)).toFixed(1)}% · p90 ${(100 * pctl(dist, 0.9)).toFixed(1)}%`);
  const rel = P.filter((p) => p.vol > 0).map((p) => p.size / p.vol);
  console.log(`  size / volume del contrato ese día: p50 ${pctl(rel, 0.5).toFixed(3)} · p90 ${pctl(rel, 0.9).toFixed(3)} · ≥0,5 en el ${((100 * rel.filter((x) => x >= 0.5).length) / rel.length).toFixed(1)}% de los prints`);
  const relOI = P.filter((p) => p.oi > 0).map((p) => p.size / p.oi);
  console.log(`  size / open_interest              : p50 ${pctl(relOI, 0.5).toFixed(3)} · p90 ${pctl(relOI, 0.9).toFixed(3)}`);
}

// ── 6. EL PRINT COMO EVENTO OPERABLE ────────────────────────────────────────────────────────
console.log(`\n## 6. ¿Cuántos prints son SIQUIERA operables?\n`);
{
  const et = (p) => Number(p.t.slice(11, 13)) - 4 + Number(p.t.slice(14, 16)) / 60;
  const cribas = [
    ["todos", () => true],
    ["con cadena del ticker en disco", (p) => conCadena.has(p.tk)],
    ["  + antes de las 15:00 ET (queda hora para ejecutar al cierre)", (p) => conCadena.has(p.tk) && et(p) < 15],
    ["  + prima ≥ $1M", (p) => conCadena.has(p.tk) && et(p) < 15 && p.prem >= 1e6],
    ["  + al ASK (ABOVE_ASK/AT_ASK/ASKSIDE)", (p) => conCadena.has(p.tk) && et(p) < 15 && p.prem >= 1e6 && /ASK/.test(p.side)],
  ];
  for (const [nombre, f] of cribas) {
    const g = P.filter(f);
    const dias = new Set(g.map((p) => p.dia)).size;
    const tks = new Map();
    for (const p of g) tks.set(p.tk, (tks.get(p.tk) ?? 0) + 1);
    const may = [...tks.entries()].sort((a, b) => b[1] - a[1])[0];
    console.log(`  ${nombre.padEnd(60)} ${fmt(g.length).padStart(9)} prints · ${dias} días · mayor ticker ${may ? `${may[0]} ${((100 * may[1]) / g.length).toFixed(1)}%` : "-"}`);
  }
}

writeFileSync("scripts/print-0-censo.json", JSON.stringify({ n: P.length, dias: diasB.length }, null, 1));
console.log(`\n  → scripts/print-0-censo.json\n`);
