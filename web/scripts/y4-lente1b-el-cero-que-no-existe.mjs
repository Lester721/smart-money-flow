// Y4 — LENTE 1b: EL CERO QUE NO EXISTE.
//
// En el fichero de cadenas NO HAY NI UNA SOLA puja de 0. Cero, en toda la muestra. Sin embargo el
// backtest dice que el 37% de las opciones "vencen sin valor". Las dos cosas no pueden ser verdad
// a la vez: lo que pasa de verdad es que el contrato DESAPARECE del fichero del dia de salida y el
// codigo lo lee como puja 0, o sea, perdida del 100%.
//
// La pregunta que decide si eso esta bien o esta mal es una sola: cuando el contrato desaparece,
// ¿estaba fuera del dinero (no valia nada, y el 0 es correcto) o estaba DENTRO del dinero (valia
// dinero, y el 0 convierte un ganador en una perdida total)?
//
// Se mide:
//   (1) el ANCHO del fichero: hasta que distancia del precio hay strikes guardados, el dia de
//       entrada y el dia de salida. Si el fichero se estrecha, los contratos se caen solos.
//   (2) para cada contrato desaparecido: donde estaba el precio de la accion el dia de salida
//       (calculado por paridad put-call SOLO en el vencimiento mas cercano) y por tanto si el
//       contrato estaba dentro o fuera del dinero.
//   (3) cuanto valia el vecino: el strike mas cercano al desaparecido que SI esta en el fichero.
//       Si el vecino de al lado vale $2, el desaparecido no valia 0.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y4-lente1b-el-cero-que-no-existe.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const ASK_MIN = 0.10;
const ENV_A = { dist: 0.10, dte: 60, tolDte: 17, tolK: 0.50 };

const pct = (x) => (100 * x).toFixed(1) + "%";
const num = (n) => Math.round(n).toLocaleString("en-US");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const cal = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const TICKERS = [...diasPorSim.keys()].sort();

const cache = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); } catch { v = null; } }
  if (cache.size >= 120) cache.delete(cache.keys().next().value);
  cache.set(k, v);
  return v;
}
function spotOk(c, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = cal(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
  if (!exp) return null;
  const g = c[exp];
  let K = null, dm = Infinity;
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
function elegir(c, S, hoy, env, tipo) {
  let exp = null, dd = Infinity;
  for (const e of Object.keys(c)) { const d = cal(hoy, e); if (d < 1) continue; const x = Math.abs(d - env.dte); if (x < dd) { dd = x; exp = e; } }
  if (!exp || dd > env.tolDte) return null;
  const objetivo = tipo === "C" ? S * (1 + env.dist) : S * (1 - env.dist);
  let K = null, ba = null, kd = Infinity;
  for (const [clave, v] of Object.entries(c[exp])) {
    if (clave.slice(-1) !== tipo) continue;
    if (!(v[1] >= ASK_MIN)) continue;
    const k = Number(clave.slice(0, -2)); const d = Math.abs(k - objetivo);
    if (d < kd) { kd = d; K = k; ba = v; }
  }
  if (K == null) return null;
  const distReal = tipo === "C" ? K / S - 1 : 1 - K / S;
  if (Math.abs(distReal - env.dist) > env.dist * env.tolK) return null;
  return { exp, K, clave: `${K}|${tipo}`, ask: ba[1] };
}

// ── (0) ¿hay alguna puja 0 en algun sitio? y ¿que ancho de strikes guarda el fichero? ────────
let ceros = 0, filas = 0, minAsk = Infinity;
const anchoArriba = [], anchoAbajo = [];
{
  let leidos = 0;
  for (const sym of TICKERS) {
    const ds = diasPorSim.get(sym);
    for (let i = 0; i < ds.length; i += 97) {          // una de cada 97, repartido por toda la historia
      const c = cadena(sym, ds[i]); if (!c) continue;
      const S = spotOk(c, ds[i]); if (!(S > 0)) continue;
      leidos++;
      for (const g of Object.values(c)) {
        let lo = Infinity, hi = -Infinity;
        for (const [cl, ba] of Object.entries(g)) {
          filas++;
          if (ba[0] === 0) ceros++;
          if (ba[1] < minAsk) minAsk = ba[1];
          const K = Number(cl.slice(0, -2));
          if (K < lo) lo = K; if (K > hi) hi = K;
        }
        if (hi > -Infinity) { anchoArriba.push(hi / S - 1); anchoAbajo.push(1 - lo / S); }
      }
    }
    cache.clear();
  }
  anchoArriba.sort((a, b) => a - b); anchoAbajo.sort((a, b) => a - b);
  const q = (v, p) => v[Math.min(v.length - 1, Math.floor(v.length * p))];
  console.log(`\n${"=".repeat(96)}`);
  console.log("  (0) ¿QUE GUARDA EL FICHERO? — muestra de 1 dia de cada 97");
  console.log(`${"=".repeat(96)}`);
  console.log(`  ${num(leidos)} dias mirados · ${num(filas)} filas de contrato`);
  console.log(`  filas con puja EXACTAMENTE 0 : ${num(ceros)} (${pct(ceros / filas)})`);
  console.log(`  la oferta mas barata que existe en todo el fichero: $${minAsk.toFixed(2)}`);
  console.log(`  hasta donde llegan los strikes guardados, por vencimiento:`);
  console.log(`    por ARRIBA: mediana ${pct(q(anchoArriba, 0.50))} sobre el precio · 10% de los casos no pasa de ${pct(q(anchoArriba, 0.10))}`);
  console.log(`    por ABAJO : mediana ${pct(q(anchoAbajo, 0.50))} bajo el precio · 10% de los casos no pasa de ${pct(q(anchoAbajo, 0.10))}`);
}

// ── (1) los contratos que desaparecen: ¿dentro o fuera del dinero? ───────────────────────────
const desap = [];   // {sym, dia, dSal, tipo, K, Ssal, mny, vecino, vecinoK, coste}
let total = 0, presentes = 0, sinSpotSal = 0;
for (const sym of TICKERS) {
  const ds = diasPorSim.get(sym);
  const vistos = new Set();
  for (let i = 0; i < ds.length; i++) {
    const dia = ds[i], mes = dia.slice(0, 6);
    if (vistos.has(mes)) continue;
    vistos.add(mes);
    const c = cadena(sym, dia); if (!c) continue;
    const S = spotOk(c, dia); if (!(S > 0)) continue;
    const dSal = ds[i + 30] ?? null; if (!dSal) continue;
    const cs = cadena(sym, dSal); if (!cs) continue;
    for (const tipo of ["C", "P"]) {
      const ct = elegir(c, S, dia, ENV_A, tipo); if (!ct) continue;
      if (dSal >= ct.exp) continue;
      const g2 = cs[ct.exp]; if (!g2) continue;
      total++;
      if (g2[ct.clave] !== undefined) { presentes++; continue; }
      const Ssal = spotOk(cs, dSal);
      if (!(Ssal > 0)) { sinSpotSal++; continue; }
      // el vecino: el strike del mismo lado y vencimiento mas cercano al desaparecido
      let vK = null, vBid = null, vd = Infinity;
      for (const [cl, ba] of Object.entries(g2)) {
        if (cl.slice(-1) !== tipo) continue;
        const K = Number(cl.slice(0, -2));
        const d = Math.abs(K - ct.K);
        if (d < vd) { vd = d; vK = K; vBid = ba[0]; }
      }
      const mny = tipo === "C" ? Ssal / ct.K - 1 : 1 - Ssal / ct.K;   // >0 = DENTRO del dinero
      desap.push({ sym, dia, dSal, tipo, K: ct.K, Ssal, mny, vecinoK: vK, vecinoBid: vBid, restan: cal(dSal, ct.exp) });
    }
  }
  cache.clear();
}
console.log(`\n${"=".repeat(96)}`);
console.log("  (1) LOS CONTRATOS QUE DESAPARECEN (envase A) — ¿dentro o fuera del dinero al salir?");
console.log(`${"=".repeat(96)}`);
console.log(`  operaciones del envase A miradas: ${num(total)} · el contrato sigue en el fichero: ${num(presentes)} (${pct(presentes / total)})`);
console.log(`  DESAPARECIDOS (hoy contados como -100%): ${num(desap.length)} (${pct(desap.length / total)}) · ${num(sinSpotSal)} sin precio de salida`);
const dentro = desap.filter((d) => d.mny > 0);
const cerca = desap.filter((d) => d.mny > -0.05 && d.mny <= 0);
console.log(`\n  | situacion al salir | n | % de los desaparecidos |`);
console.log(`  |---|---|---|`);
console.log(`  | DENTRO del dinero (valian dinero seguro) | ${num(dentro.length)} | ${pct(dentro.length / desap.length)} |`);
console.log(`  | a menos del 5% de estarlo | ${num(cerca.length)} | ${pct(cerca.length / desap.length)} |`);
console.log(`  | mas del 5% fuera | ${num(desap.length - dentro.length - cerca.length)} | ${pct((desap.length - dentro.length - cerca.length) / desap.length)} |`);
const mny = desap.map((d) => d.mny).sort((a, b) => a - b);
const qq = (p) => mny[Math.min(mny.length - 1, Math.floor(mny.length * p))];
console.log(`\n  cuanto fuera del dinero estaban (negativo = fuera): 10% ${pct(qq(0.10))} · mediana ${pct(qq(0.50))} · 90% ${pct(qq(0.90))} · maximo ${pct(mny[mny.length - 1])}`);
const conVec = desap.filter((d) => d.vecinoBid != null);
const vb = conVec.map((d) => d.vecinoBid).sort((a, b) => a - b);
console.log(`  el vecino que SI esta en el fichero: mediana de su puja $${vb[Math.floor(vb.length / 2)].toFixed(2)} · 90% $${vb[Math.floor(vb.length * 0.9)].toFixed(2)} · distancia mediana al desaparecido ${(conVec.map((d) => Math.abs(d.vecinoK - d.K)).sort((a, b) => a - b)[Math.floor(conVec.length / 2)]).toFixed(2)} puntos de strike`);
const restan = desap.map((d) => d.restan).sort((a, b) => a - b);
console.log(`  dias que le quedaban al vencimiento cuando desaparecio: mediana ${restan[Math.floor(restan.length / 2)]}`);
if (dentro.length) {
  console.log(`\n  LOS QUE ESTABAN DENTRO DEL DINERO Y SE CUENTAN COMO PERDIDA TOTAL (primeros 12):`);
  for (const d of dentro.sort((a, b) => b.mny - a.mny).slice(0, 12)) {
    console.log(`    ${d.sym} ${d.tipo} K=${d.K} · sale ${d.dSal} con la accion en ${d.Ssal.toFixed(2)} → ${pct(d.mny)} DENTRO · vecino K=${d.vecinoK} puja $${(d.vecinoBid ?? 0).toFixed(2)}`);
  }
}
console.log("");
