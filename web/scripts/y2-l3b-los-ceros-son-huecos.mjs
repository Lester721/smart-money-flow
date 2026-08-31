// ¿LOS "CEROS" DE LA SALIDA SON CEROS DE VERDAD O SON HUECOS?
//
// En scripts/y2-esta-barata-la-opcion.mjs, al salir se hace:
//     const salida = grupo[ct.clave]?.[0] ?? 0;    // "sin puja = 0. Dato real."
//
// La lente 3 destapó que en 13,621 operaciones NUNCA se leyó un bid de 0 de verdad: los 2,718
// ceros son TODOS claves que no están en el fichero. Y un barrido de 673,289 contratos confirma
// que en las cadenas NO EXISTE el bid 0 — el bid más bajo del fichero entero es $0.01. O sea que
// el descargador tiró los contratos sin puja... o tiró los contratos fuera de cierto rango de
// strikes. Los dos casos se ven EXACTAMENTE IGUAL desde el código: la clave no está.
//
// Aquí se separan con una prueba que no necesita ningún dato nuevo — LA COHERENCIA DE LA CADENA:
//
//   Si mi call de strike K no está porque nadie puja por ella, entonces NINGUNA call de strike
//   MAYOR que K (que vale todavía menos) puede estar cotizando. Si encuentro una call más lejos
//   del dinero CON PUJA mientras la mía falta, mi ausencia NO es falta de puja: es un hueco.
//   (Y al revés para las puts: ninguna put de strike MENOR.)
//
// Además se mira dónde queda el strike respecto del rango de strikes que el fichero sí trae ese
// día: si mi strike cae FUERA del rango descargado, es truncamiento puro.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y2-l3b-los-ceros-son-huecos.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const ENV = { A: { dist: 0.10, dte: 60, salida: 30 }, B: { dist: 0.05, dte: 90, salida: 30 } };
const ASKMIN = 0.10, TOLK = 0.50;
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const tolDte = (d) => Math.max(6, Math.round(d * 0.28));
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/d");
const num = (n) => Math.round(n).toLocaleString("en-US");
const mediana = (v) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/); if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const TICKERS = [...diasPorSim.keys()].sort();

const cache = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cache.has(k)) return cache.get(k);
  const f = `${CDIR}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); } catch { v = null; } }
  if (cache.size >= 200) cache.delete(cache.keys().next().value);
  cache.set(k, v); return v;
}
function spotOk(c, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
  if (!exp) return null;
  const g = c[exp]; let K = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[`${k}|P`]; if (!p) continue;
    const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null) return null;
  const C = g[`${K}|C`], P = g[`${K}|P`];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2;
  return s > 0 ? s : null;
}
function expObjetivo(c, hoy, objetivo) {
  let mejor = null, md = Infinity, dtReal = 0;
  for (const e of Object.keys(c)) { const dt = dteDe(hoy, e); if (dt < 1) continue; const x = Math.abs(dt - objetivo); if (x < md) { md = x; mejor = e; dtReal = dt; } }
  if (!mejor || md > tolDte(objetivo)) return null;
  return { exp: mejor, dte: dtReal };
}
function contratoEsquina(c, exp, S, dist, tipo) {
  const g = c[exp]; if (!g) return null;
  const objetivo = tipo === "C" ? S * (1 + dist) : S * (1 - dist);
  let mej = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== tipo || !(ba[1] >= ASKMIN)) continue;
    const K = Number(cl.slice(0, -2)); const d = Math.abs(K - objetivo);
    if (d < dm) { dm = d; mej = { K, clave: cl, bid: ba[0], ask: ba[1] }; }
  }
  if (!mej) return null;
  const dr = tipo === "C" ? mej.K / S - 1 : 1 - mej.K / S;
  if (Math.abs(dr - dist) > dist * TOLK) return null;
  return mej;
}

const R = { A: [], B: [] };
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const serie = [], vistos = new Set(), idx = [];
  for (let i = 0; i < dias.length; i++) {
    const c = cadena(sym, dias[i]);
    if (!c) { serie.push(null); continue; }
    const S = spotOk(c, dias[i]);
    if (!S) { serie.push(null); continue; }
    serie.push({ S });
    const mes = dias[i].slice(0, 6);
    if (!vistos.has(mes)) { vistos.add(mes); idx.push(i); }
  }
  for (const i of idx) {
    const f = serie[i]; if (!f) continue;
    const c = cadena(sym, dias[i]); if (!c) continue;
    for (const [k, e] of Object.entries(ENV)) {
      const eo = expObjetivo(c, dias[i], e.dte); if (!eo) continue;
      const iSal = i + e.salida;
      if (dias[iSal] == null) continue;
      let ds = dias[iSal]; if (ds >= eo.exp) ds = eo.exp;
      const cs = cadena(sym, ds); if (!cs) continue;
      const g = cs[eo.exp]; if (!g) continue;
      const Ssal = serie[iSal] ? serie[iSal].S : null;
      for (const tipo of ["C", "P"]) {
        const ct = contratoEsquina(c, eo.exp, f.S, e.dist, tipo); if (!ct) continue;
        const presente = g[ct.clave] !== undefined;
        // rango de strikes del MISMO tipo que el fichero trae ese día en ese vencimiento
        let lo = Infinity, hi = -Infinity, nT = 0, masLejosConPuja = 0, mejorLejano = null;
        for (const [cl, ba] of Object.entries(g)) {
          if (cl.slice(-1) !== tipo) continue;
          const K = Number(cl.slice(0, -2)); nT++;
          if (K < lo) lo = K; if (K > hi) hi = K;
          const masLejos = tipo === "C" ? K > ct.K : K < ct.K;
          if (!presente && masLejos && ba[0] > 0) { masLejosConPuja++; if (!mejorLejano || (tipo === "C" ? K < mejorLejano.K : K > mejorLejano.K)) mejorLejano = { K, bid: ba[0] }; }
        }
        R[k].push({
          sym, dia: dias[i], tipo, K: ct.K, presente,
          fuera: !presente && (ct.K < lo || ct.K > hi),
          incoherente: !presente && masLejosConPuja > 0,
          lejanoK: mejorLejano?.K ?? null, lejanoBid: mejorLejano?.bid ?? null,
          nStrikes: nT,
          distSal: Ssal ? (tipo === "C" ? ct.K / Ssal - 1 : 1 - ct.K / Ssal) : null,
        });
      }
    }
  }
  cache.clear();
  process.stderr.write(`\r  ${sym} · ${num(R.A.length + R.B.length)}   `);
}
process.stderr.write("\n");

for (const k of ["A", "B"]) {
  const v = R[k], aus = v.filter((x) => !x.presente);
  console.log(`\n${"═".repeat(100)}\n  ENVASE ${k} — ${num(v.length)} salidas examinadas\n${"═".repeat(100)}`);
  console.log(`  claves AUSENTES en la cadena de salida (el código las lee como cero): ${num(aus.length)} (${pct(aus.length / v.length)})`);
  if (!aus.length) continue;
  const fuera = aus.filter((x) => x.fuera), inc = aus.filter((x) => x.incoherente);
  console.log(`\n  A) el strike cae FUERA del rango de strikes que el fichero trae ese día : ${num(fuera.length)} (${pct(fuera.length / aus.length)} de las ausentes)`);
  console.log(`     → truncamiento del descargador, no falta de puja.`);
  console.log(`  B) hay un contrato MÁS LEJOS DEL DINERO (vale menos) CON PUJA ese día    : ${num(inc.length)} (${pct(inc.length / aus.length)} de las ausentes)`);
  console.log(`     → incoherente con "nadie puja por la mía": es un hueco.`);
  const sanas = aus.filter((x) => !x.fuera && !x.incoherente);
  console.log(`  C) ausencia COHERENTE (dentro del rango y nada más lejos tiene puja)     : ${num(sanas.length)} (${pct(sanas.length / aus.length)} de las ausentes)`);
  console.log(`     → esto sí es un cero legítimo.`);
  const conB = inc.filter((x) => x.lejanoBid != null);
  if (conB.length) console.log(`\n  en las incoherentes, la puja del contrato MÁS LEJANO: mediana $${mediana(conB.map((x) => x.lejanoBid)).toFixed(2)} · máxima $${Math.max(...conB.map((x) => x.lejanoBid)).toFixed(2)}`);
  const dd = aus.filter((x) => x.distSal != null).map((x) => x.distSal);
  console.log(`  distancia del strike al precio EN LA SALIDA (ausentes): mediana ${pct(mediana(dd))} fuera del dinero`);
  const ddp = v.filter((x) => x.presente && x.distSal != null).map((x) => x.distSal);
  console.log(`  la misma distancia en las PRESENTES: mediana ${pct(mediana(ddp))}`);
  console.log(`  strikes por vencimiento y lado en la cadena de salida: mediana ${mediana(v.map((x) => x.nStrikes))}`);
  console.log(`\n  ejemplos incoherentes (mi strike falta pero uno MÁS LEJOS tiene puja):`);
  for (const x of inc.slice(0, 6)) console.log(`    ${x.sym} ${x.dia} ${x.tipo} K=${x.K} AUSENTE · pero K=${x.lejanoK} (más lejos) puja $${x.lejanoBid}`);
}
console.log("");
