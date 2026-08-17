// RADIOGRAFÍA previa a scripts/conv-selector.mjs — trampa nº2: "el dato no contiene lo que crees".
// Sólo lee y cuenta. No mide ningún hallazgo. Lanza si algo está muerto.
//
//   node --max-old-space-size=8192 scripts/conv-radiografia.mjs
import { readFileSync, existsSync, readdirSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const OIDIR = "scripts/cache-theta/oi-ancho";
const CIERRES = "scripts/cache-theta/cierres";
const FLUJO = "scripts/cache-theta/flujo-historico";

const log = (...a) => console.log(...a);
function exige(cond, msg) { if (!cond) { throw new Error("RADIOGRAFÍA FALLA: " + msg); } }

// ── 1. inventario de ficheros ────────────────────────────────────────────────
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/); if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
log(`cadenas: ${diasPorSim.size} tickers`);
const simbolos = [...diasPorSim.keys()].sort();
log("  " + simbolos.join(" "));

// ── 2. cierres: cobertura y escala (¿ajustados por split o tal cual?) ────────
const cierres = {};
for (const s of simbolos) {
  const f = `${CIERRES}/${s}.json`;
  exige(existsSync(f), `falta ${f}`);
  const c = JSON.parse(readFileSync(f, "utf8"));
  const k = Object.keys(c).sort();
  const ceros = k.filter((d) => !(c[d] > 0)).length;
  exige(ceros === 0, `${s}: ${ceros} cierres <= 0`);
  cierres[s] = c;
}
const rangos = simbolos.map((s) => { const k = Object.keys(cierres[s]).sort(); return `${s} ${k[0]}..${k.at(-1)} n=${k.length}`; });
log("cierres:\n  " + rangos.join("\n  "));

// ── 3. detector de splits desde la propia serie de cierres (sin mirar fuera) ─
const CAND = [2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 8, 1 / 10, 1 / 20];
const splits = {};
for (const s of simbolos) {
  splits[s] = [];
  const k = Object.keys(cierres[s]).sort();
  for (let i = 1; i < k.length; i++) {
    const r = cierres[s][k[i - 1]] / cierres[s][k[i]];      // ratio = precio viejo / nuevo
    if (r > 1.35 || r < 0.72) {
      let mejor = null, dif = 9;
      for (const c of CAND) { const d = Math.abs(r / c - 1); if (d < dif) { dif = d; mejor = c; } }
      splits[s].push({ dia: k[i], ratioBruto: +r.toFixed(3), ratio: dif < 0.05 ? mejor : null, dif: +dif.toFixed(3) });
    }
  }
}
log("SALTOS de precio > +-35% en un día (candidatos a split):");
for (const s of simbolos) for (const x of splits[s]) log(`  ${s} ${x.dia} bruto=${x.ratioBruto} -> ratio=${x.ratio ?? "SIN CUADRAR"} (dif ${x.dif})`);

// ── 4. estructura de una cadena: vencimientos, strikes, ceros ────────────────
function radiografiaCadena(sym, dia) {
  const f = `${CDIR}/${sym}_d${dia}.json`;
  if (!existsSync(f)) return null;
  const c = JSON.parse(readFileSync(f, "utf8"));
  const exps = Object.keys(c).sort();
  let nC = 0, nP = 0, askCero = 0, bidCero = 0, askMenorBid = 0, total = 0;
  for (const g of Object.values(c)) for (const [k, ba] of Object.entries(g)) {
    total++;
    if (k.endsWith("C")) nC++; else nP++;
    if (!(ba[1] > 0)) askCero++;
    if (!(ba[0] > 0)) bidCero++;
    if (ba[1] < ba[0]) askMenorBid++;
  }
  return { exps, nExp: exps.length, total, nC, nP, askCero, bidCero, askMenorBid };
}
for (const [sym, dia] of [["AAPL", "20210104"], ["NVDA", "20240102"], ["TSLA", "20230103"], ["SPY", "20250102"], ["KO", "20220103"]]) {
  const r = radiografiaCadena(sym, dia);
  exige(r && r.total > 0, `${sym} ${dia} cadena vacía`);
  log(`${sym} ${dia}: ${r.nExp} vencs (${r.exps[0]}..${r.exps.at(-1)}), ${r.total} contratos, C=${r.nC} P=${r.nP}, ask<=0 ${r.askCero}, bid<=0 ${r.bidCero}, ask<bid ${r.askMenorBid}`);
}

// ── 5. ¿el spot por PARIDAD coincide con el cierre real? (valida la escala) ──
function spotParidad(c) {
  let mejorK = null, mejorDif = Infinity, mejorT = null;
  for (const [exp, g] of Object.entries(c)) {
    for (const [clave, ba] of Object.entries(g)) {
      if (!clave.endsWith("C")) continue;
      const K = Number(clave.slice(0, -2)); if (!(K > 0)) continue;
      const p = g[`${K}|P`]; if (!p) continue;
      if (!(ba[0] > 0 && ba[1] > 0 && p[0] > 0 && p[1] > 0)) continue;
      const dif = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
      if (dif < mejorDif) { mejorDif = dif; mejorK = K; mejorT = exp; }
    }
  }
  return mejorK;
}
let errs = [];
for (const s of simbolos) {
  const dias = diasPorSim.get(s).filter((d) => d >= "20210104" && d <= "20260806");
  for (const d of [dias[10], dias[Math.floor(dias.length / 2)], dias.at(-10)]) {
    if (!d) continue;
    const f = `${CDIR}/${s}_d${d}.json`; if (!existsSync(f)) continue;
    const sp = spotParidad(JSON.parse(readFileSync(f, "utf8")));
    const real = cierres[s][d];
    if (sp && real) errs.push({ s, d, sp, real, err: Math.abs(sp / real - 1) });
  }
}
errs.sort((a, b) => b.err - a.err);
log(`paridad vs cierre real: n=${errs.length}, error mediano ${(errs[Math.floor(errs.length / 2)].err * 100).toFixed(2)}%, peor ${(errs[0].err * 100).toFixed(1)}% (${errs[0].s} ${errs[0].d}: paridad ${errs[0].sp} vs cierre ${errs[0].real})`);
exige(errs[Math.floor(errs.length / 2)].err < 0.05, "el spot por paridad no cuadra con el cierre: escalas distintas");

// ── 6. ¿existe un vencimiento a ~90 días y strikes al +30%? ──────────────────
const msd = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);
let conVenc = 0, sinVenc = 0, conStrike = 0, sinStrike = 0, otmDisp = [];
for (const s of simbolos) {
  const dias = diasPorSim.get(s).filter((d) => d >= "20210104" && d <= "20260531");
  const finMes = new Map(); for (const d of dias) finMes.set(d.slice(0, 6), d);
  for (const d of [...finMes.values()]) {
    const f = `${CDIR}/${s}_d${d}.json`; if (!existsSync(f)) continue;
    const c = JSON.parse(readFileSync(f, "utf8"));
    const objetivo = msd(d) + 90 * 86400000;
    let ex = null, dif = Infinity;
    for (const e of Object.keys(c)) {
      const dte = (msd(e) - msd(d)) / 86400000;
      if (dte < 60 || dte > 120) continue;
      const dd = Math.abs(msd(e) - objetivo);
      if (dd < dif) { dif = dd; ex = e; }
    }
    if (!ex) { sinVenc++; continue; }
    conVenc++;
    const sp = cierres[s][d]; if (!(sp > 0)) continue;
    const ks = Object.keys(c[ex]).filter((k) => k.endsWith("C")).map((k) => Number(k.slice(0, -2))).filter((k) => k > 0).sort((a, b) => a - b);
    if (!ks.length) { sinStrike++; continue; }
    otmDisp.push(ks.at(-1) / sp);
    const obj = sp * 1.30;
    const mejor = ks.reduce((a, k) => (Math.abs(k - obj) < Math.abs(a - obj) ? k : a), ks[0]);
    if (Math.abs(mejor / obj - 1) < 0.10) conStrike++; else sinStrike++;
  }
}
otmDisp.sort((a, b) => a - b);
log(`vencimiento 60-120d: ${conVenc} sí / ${sinVenc} no`);
log(`strike al +30% (tolerancia 10%): ${conStrike} sí / ${sinStrike} no`);
log(`techo del escalón de strikes / spot: p05 ${otmDisp[Math.floor(otmDisp.length * .05)].toFixed(2)}x  mediana ${otmDisp[Math.floor(otmDisp.length / 2)].toFixed(2)}x  p95 ${otmDisp[Math.floor(otmDisp.length * .95)].toFixed(2)}x`);
exige(conStrike / (conStrike + sinStrike) > 0.8, "no hay strikes al +30% en la mayoría de los casos");

// ── 7. flujo: ¿tiene bid/ask del momento para saber quién inició? ────────────
const ff = readdirSync(FLUJO);
let opsTot = 0, conBA = 0, agresorC = 0, agresorV = 0, medio = 0, dias = 0, sinNotables = 0;
const symsFlujo = new Set();
for (const f of ff) {
  const m = f.match(/^([A-Z]+)_(\d{8})\.json$/); if (!m) continue;
  symsFlujo.add(m[1]); dias++;
  const j = JSON.parse(readFileSync(`${FLUJO}/${f}`, "utf8"));
  const n = j.notables || [];
  if (!n.length) { sinNotables++; continue; }
  for (const o of n) {
    opsTot++;
    if (o.bid > 0 && o.ask > 0 && o.ask >= o.bid) {
      conBA++;
      if (o.price >= o.ask) agresorC++; else if (o.price <= o.bid) agresorV++; else medio++;
    }
  }
}
log(`flujo: ${dias} ficheros (${sinNotables} sin operaciones), ${[...symsFlujo].sort().join(" ")}`);
log(`  ${opsTot} operaciones, ${conBA} con bid/ask válido (${(100 * conBA / opsTot).toFixed(1)}%)`);
log(`  agresor COMPRA ${agresorC} (${(100 * agresorC / conBA).toFixed(1)}%) · agresor VENTA ${agresorV} (${(100 * agresorV / conBA).toFixed(1)}%) · en medio ${medio} (${(100 * medio / conBA).toFixed(1)}%)`);
exige(opsTot > 100000, `el flujo sólo tiene ${opsTot} operaciones`);
exige(agresorC > 1000 && agresorV > 1000, "no se puede separar quién inició");

// ── 8. oi-ancho: cobertura de strikes y ceros ───────────────────────────────
let oiFilas = 0, oiCero = 0, oiRatio = [];
for (const [s, d] of [["AAPL", "20210104"], ["NVDA", "20240102"], ["TSLA", "20230103"], ["QQQ", "20250102"]]) {
  const f = `${OIDIR}/${s}_d${d}.json`; exige(existsSync(f), `falta ${f}`);
  const o = JSON.parse(readFileSync(f, "utf8"));
  const sp = cierres[s][d];
  let ks = [];
  for (const g of Object.values(o)) for (const [k, v] of Object.entries(g)) { oiFilas++; if (!(Number(v) > 0)) oiCero++; ks.push(Number(k.slice(0, -2))); }
  ks.sort((a, b) => a - b);
  oiRatio.push(`${s} ${d}: strikes ${(ks[0] / sp).toFixed(2)}x..${(ks.at(-1) / sp).toFixed(2)}x del spot, ${Object.keys(o).length} vencs`);
}
log(`oi-ancho: ${oiFilas} filas, ${oiCero} con OI<=0 (${(100 * oiCero / oiFilas).toFixed(1)}%)`);
for (const l of oiRatio) log("  " + l);
exige(oiCero / oiFilas < 0.5, "más de la mitad del OI son ceros — el fichero no contiene lo que crees");

log("\nRADIOGRAFÍA OK");
