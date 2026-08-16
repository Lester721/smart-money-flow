// AUDITORIA 3 (solo lectura). Dos cosas:
//   1) Reproduce detectarSplits() TAL CUAL esta hoy en eva-comprar-largo.mjs y examina el RATIO.
//   2) Repite ask->bid vs mid->mid EXCLUYENDO toda ventana que cruce un split, para que el
//      hallazgo "el 0,68% es peaje de horquilla" no dependa del bug de splits.
// Uso: node --max-old-space-size=6144 scripts/audit-horquilla-vs-seleccion.mjs [paso]
import { readFileSync, existsSync, readdirSync } from "node:fs";

const FDIR = "scripts/cache-theta/flujo-historico";
const CDIR = "scripts/cache-theta/cadenas";
const PASO = Number(process.argv[2] || 6);
const HORIZONTES = [30, 90, 180, 365];
const PRIMA_MIN = 3_000_000, CUBO_EXP_DIAS = 30, CUBO_LO = 0.5, CUBO_HI = 2.0, CUBO_MIN = 5;

const sinG = (s) => String(s).replace(/-/g, "");
const aIso = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
const ms = (ymd) => Date.parse(aIso(ymd) + "T00:00:00Z");

const diasPorSimbolo = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  (diasPorSimbolo.get(m[1]) ?? diasPorSimbolo.set(m[1], []).get(m[1])).push(m[2]);
}
for (const v of diasPorSimbolo.values()) v.sort();
const ULTIMO_DIA = Math.max(...[...diasPorSimbolo.values()].map((v) => Number(v[v.length - 1])));

const cacheCad = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  const hit = cacheCad.get(k);
  if (hit !== undefined) { cacheCad.delete(k); cacheCad.set(k, hit); return hit; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cacheCad.set(k, v);
  if (cacheCad.size > 250) cacheCad.delete(cacheCad.keys().next().value);
  return v;
}
function diaSalida(sym, objetivo) {
  const dias = diasPorSimbolo.get(sym); if (!dias) return null;
  let lo = 0, hi = dias.length - 1, res = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dias[m] >= objetivo) { res = dias[m]; hi = m - 1; } else lo = m + 1; }
  if (!res) return null;
  return (ms(res) - ms(objetivo)) / 86_400_000 <= 10 ? res : null;
}

// ── 1. detectarSplits() COPIADO del script de produccion, sin tocar ──────────
function detectarSplits() {
  const out = [];
  for (const [sym, dias] of diasPorSimbolo) {
    let prev = 0;
    for (const d of dias) {
      if (d < "20231001") continue;
      const c = cadena(sym, d); if (!c) continue;
      let maxK = 0;
      for (const grupo of Object.values(c))
        for (const clave of Object.keys(grupo)) { const k = Number(clave.slice(0, -2)); if (k > maxK) maxK = k; }
      if (prev && maxK > 0 && prev / maxK >= 1.8) out.push({ sym, desde: d, ratio: prev / maxK, prev, maxK });
      prev = maxK;
    }
  }
  return out;
}
const SPLITS = detectarSplits();
console.log("=== 1. SPLITS DETECTADOS POR EL CODIGO ACTUAL ===");
for (const s of SPLITS) {
  console.log(`  ${s.sym} desde ${s.desde}  ratio=${s.ratio}  (strikeMax ${s.prev} -> ${s.maxK})  ratio redondeado=${Math.round(s.ratio)}`);
  // ¿la clave ajustada cae en un numero limpio?
  for (const k of [1200, 1100, 500, 120]) console.log(`      strike ${k} / ratio = ${k / s.ratio}   (con ratio entero: ${k / Math.round(s.ratio)})`);
}
if (!SPLITS.length) console.log("  ninguno");

const cruzaSplit = (sym, dEnt, dSal) => SPLITS.some((s) => s.sym === sym && s.desde > dEnt && s.desde <= dSal);

// ── 2. ask->bid vs mid->mid, SIN ventanas que crucen split ───────────────────
function retAB(cE, cS, exp, clave) {
  const e = cE?.[exp]?.[clave]; if (!e) return null;
  const ask = e[1]; if (!(ask > 0)) return null;
  const s = cS?.[exp]?.[clave];
  return ((s ? s[0] : 0) - ask) / ask;
}
function retMM(cE, cS, exp, clave) {
  const e = cE?.[exp]?.[clave]; if (!e) return null;
  const mE = (e[0] + e[1]) / 2; if (!(mE > 0)) return null;
  const s = cS?.[exp]?.[clave];
  return ((s ? (s[0] + s[1]) / 2 : 0) - mE) / mE;
}
const media = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
const sd = (x) => { const m = media(x); return Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / (x.length - 1)); };
const t1 = (x) => media(x) / (sd(x) / Math.sqrt(x.length));
const pct = (v) => (v * 100).toFixed(2) + "%";

const ficheros = readdirSync(FDIR).filter((f) => f.endsWith(".json")).sort().filter((_, i) => i % PASO === 0);
const acc = {}; for (const H of HORIZONTES) acc[H] = { ab: [], mm: [], sT: [], sC: [], nCruce: 0 };

for (const f of ficheros) {
  const j = JSON.parse(readFileSync(`${FDIR}/${f}`, "utf8"));
  const sym = j.sym, entrada = j.dia;
  const notables = (j.notables || []).filter((n) => n.prima >= PRIMA_MIN);
  if (!notables.length) continue;
  const cadEnt = cadena(sym, entrada); if (!cadEnt) continue;
  const msEnt = ms(entrada);
  const universo = [];
  for (const [exp, grupo] of Object.entries(cadEnt)) {
    const msExp = ms(exp);
    for (const [clave, ba] of Object.entries(grupo)) if (ba[1] > 0)
      universo.push({ exp, msExp, clave, right: clave.slice(-1), ask: ba[1], bid: ba[0] });
  }
  for (const n of notables) {
    const expYmd = sinG(n.exp), clave = `${n.strike}|${n.right}`;
    const ent = cadEnt[expYmd]?.[clave]; if (!ent || !(ent[1] > 0)) continue;
    const askEnt = ent[1], bidEnt = ent[0], msExp = ms(expYmd);
    const cubo = universo.filter((u) => u.right === n.right &&
      Math.abs(u.msExp - msExp) <= CUBO_EXP_DIAS * 86_400_000 &&
      u.ask >= askEnt * CUBO_LO && u.ask <= askEnt * CUBO_HI && !(u.exp === expYmd && u.clave === clave));
    if (cubo.length < CUBO_MIN) continue;
    for (const H of HORIZONTES) {
      const objetivo = sinG(new Date(msEnt + H * 86_400_000).toISOString().slice(0, 10));
      if (msExp <= ms(objetivo) || Number(objetivo) > ULTIMO_DIA) continue;
      const dSal = diaSalida(sym, objetivo); if (!dSal) continue;
      if (cruzaSplit(sym, entrada, dSal)) { acc[H].nCruce++; continue; }   // FUERA
      const cadSal = cadena(sym, dSal); if (!cadSal) continue;
      const rAB = retAB(cadEnt, cadSal, expYmd, clave); if (rAB === null) continue;
      const rMM = retMM(cadEnt, cadSal, expYmd, clave);
      let sAB = 0, sMM = 0, sSpr = 0, cta = 0;
      for (const u of cubo) {
        if (u.msExp <= ms(objetivo)) continue;
        const r = retAB(cadEnt, cadSal, u.exp, u.clave); if (r === null) continue;
        sAB += r; sMM += retMM(cadEnt, cadSal, u.exp, u.clave); sSpr += (u.ask - u.bid) / u.ask; cta++;
      }
      if (cta < CUBO_MIN) continue;
      acc[H].ab.push(rAB - sAB / cta); acc[H].mm.push(rMM - sMM / cta);
      acc[H].sT.push((askEnt - bidEnt) / askEnt); acc[H].sC.push(sSpr / cta);
    }
  }
}

console.log(`\n=== 2. SIN VENTANAS QUE CRUCEN SPLIT (1 de cada ${PASO} dias) ===`);
console.log("horiz     n   fuera   DIF ask->bid      t     DIF mid->mid      t   | horq T  horq C   dif(pp)");
for (const H of HORIZONTES) {
  const a = acc[H]; if (a.ab.length < 20) { console.log(`${String(H).padStart(4)}d  muestra insuficiente (${a.ab.length})`); continue; }
  const dif = media(a.sT.map((v, i) => v - a.sC[i]));
  console.log(`${String(H).padStart(4)}d ${String(a.ab.length).padStart(6)} ${String(a.nCruce).padStart(6)}   ${pct(media(a.ab)).padStart(9)} ${t1(a.ab).toFixed(2).padStart(7)}   ${pct(media(a.mm)).padStart(9)} ${t1(a.mm).toFixed(2).padStart(7)}   | ${pct(media(a.sT)).padStart(6)} ${pct(media(a.sC)).padStart(7)} ${(dif * 100).toFixed(2).padStart(9)}`);
}
console.log("\nSi 'DIF ask->bid' es grande y 'DIF mid->mid' ~0, el efecto NO es eleccion de contrato:");
console.log("es que el contrato del flujo tiene la horquilla mas estrecha y paga menos peaje.");
