// LOS SPLITS, DETECTADOS BIEN — corrige el detector burdo del intento anterior.
//
// ═══ POR QUÉ HIZO FALTA REHACERLO ═══════════════════════════════════════════════════════════
//
// El primer intento detectaba el split comparando el strike MEDIANO de la cadena entre dos días.
// Eso está mal: cuando una acción sube, la bolsa AÑADE strikes más altos y el mediano se mueve
// solo, sin que haya habido ningún split. Con ese detector salían "splits" de AAPL en 2017 y de
// TSLA cada dos semanas, y al "recuperar" el contrato equivalente se comparaba una put de 100
// con una put de 150 — o sea que fabricaba ganancias del 3.800%. Un dato inventado. Se tira.
//
// ═══ EL DETECTOR QUE NO SE DEJA ENGAÑAR ═════════════════════════════════════════════════════
//
// Un split REESCALA la rejilla entera: los strikes viejos DESAPARECEN. Añadir strikes nuevos no
// borra los viejos. Así que la prueba es:
//
//     ¿qué fracción de los strikes que existían el día de la compra sigue existiendo el día de
//     la salida, en el MISMO vencimiento?
//
//   · fracción alta  → sólo se añadieron strikes. No hay split.
//   · fracción casi cero → la rejilla se reescaló. Hay split (o cambio de identidad del ticker).
//
// El factor del split no se adivina: se prueban los factores reales que usa la bolsa
// (2, 3, 4, 5, 10, 20 a 1 y los inversos) y se elige el que hace que los strikes viejos
// multiplicados encajen con los nuevos. Si ninguno encaja, se dice y la operación se descarta:
// no se inventa un precio.
//
// El valor de salida reajustado: un split de 4 a 1 convierte el strike K en K/4 y UN contrato
// en CUATRO. Así que la posición original vale 4 × la puja del contrato nuevo.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y2-lente2-splits-bien-detectados.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const ENV = { dist: 0.10, dte: 60, salida: 30 };
const ASKMIN = 0.10, TOLK = 0.50, VENT_PCTL = 250, MIN_PCTL = 150, APUESTA = 1000;
const FACTORES = [1 / 20, 1 / 10, 1 / 8, 1 / 5, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 2, 2, 3, 4, 5, 8, 10, 20];
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/d");
const num = (n) => Math.round(n).toLocaleString("en-US");
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const TICKERS = [...diasPorSim.keys()].sort();

const cache = new Map(); const MAXC = 200;
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); } catch { v = null; } }
  if (cache.size >= MAXC) cache.delete(cache.keys().next().value);
  cache.set(k, v);
  return v;
}
function spotOk(c, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
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
function expObjetivo(c, hoy, objetivo) {
  let mejor = null, md = Infinity, dtReal = 0;
  for (const e of Object.keys(c)) {
    const dt = dteDe(hoy, e); if (dt < 1) continue;
    const x = Math.abs(dt - objetivo); if (x < md) { md = x; mejor = e; dtReal = dt; }
  }
  if (!mejor || md > Math.max(6, Math.round(objetivo * 0.28))) return null;
  return { exp: mejor, dte: dtReal };
}
function cunaDe(c, exp, S) {
  const g = c[exp]; if (!g) return null;
  let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); if (!g[`${k}|P`]) continue;
    const d = Math.abs(k - S); if (d < dm) { dm = d; K = k; }
  }
  if (K == null || Math.abs(K / S - 1) > 0.05) return null;
  const a = g[`${K}|C`][1], b = g[`${K}|P`][1];
  return a > 0 && b > 0 ? (a + b) / S : null;
}
function contratoEsquina(c, exp, S, dist, tipo) {
  const g = c[exp]; if (!g) return null;
  const objetivo = tipo === "C" ? S * (1 + dist) : S * (1 - dist);
  let mej = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== tipo || !(ba[1] >= ASKMIN)) continue;
    const K = Number(cl.slice(0, -2));
    const d = Math.abs(K - objetivo);
    if (d < dm) { dm = d; mej = { K, clave: cl, bid: ba[0], ask: ba[1] }; }
  }
  if (!mej) return null;
  const distReal = tipo === "C" ? mej.K / S - 1 : 1 - mej.K / S;
  return Math.abs(distReal - dist) > dist * TOLK ? null : mej;
}
const strikesDe = (g, tipo) => Object.keys(g).filter((x) => x.slice(-1) === tipo).map((x) => Number(x.slice(0, -2)));
const casi = (a, b) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(a));

/** ¿Se reescaló la rejilla entre entrada y salida, en el MISMO vencimiento? */
function reajuste(gEnt, gSal, tipo) {
  const kE = strikesDe(gEnt, tipo), kS = new Set(strikesDe(gSal, tipo));
  if (kE.length < 4 || kS.size < 4) return { hay: false, superv: NaN, factor: 1 };
  const superv = kE.filter((k) => [...kS].some((x) => casi(k, x))).length / kE.length;
  if (superv > 0.30) return { hay: false, superv, factor: 1 };
  // rejilla reescalada: se busca el factor real de bolsa que hace encajar los strikes viejos
  let mejor = null, mejorEnc = 0;
  for (const f of FACTORES) {
    const enc = kE.filter((k) => [...kS].some((x) => casi(k * f, x))).length / kE.length;
    if (enc > mejorEnc) { mejorEnc = enc; mejor = f; }
  }
  return { hay: true, superv, factor: mejorEnc >= 0.5 ? mejor : null, encaje: mejorEnc };
}

const OPS = []; const REAJ = [];
const t0 = Date.now();
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const serie = []; const vistos = new Set(); const entradasIdx = [];
  for (let i = 0; i < dias.length; i++) {
    const d = dias[i]; const c = cadena(sym, d);
    if (!c) { serie.push(null); continue; }
    const S = spotOk(c, d); if (!S) { serie.push(null); continue; }
    const eo = expObjetivo(c, d, ENV.dte);
    serie.push({ d, S, exp: eo?.exp ?? null, dte: eo?.dte ?? null, cuna: eo ? cunaDe(c, eo.exp, S) : null });
    const mes = d.slice(0, 6);
    if (!vistos.has(mes)) { vistos.add(mes); entradasIdx.push(i); }
  }
  const ret = new Array(dias.length).fill(null);
  for (let i = 1; i < dias.length; i++) {
    const a = serie[i - 1], b = serie[i];
    if (!a || !b || dteDe(a.d, b.d) > 5) continue;
    const r = Math.log(b.S / a.S);
    if (Math.abs(r) <= 0.35) ret[i] = r;
  }
  const coc = new Array(dias.length).fill(null);
  for (let i = 0; i < dias.length; i++) {
    const f = serie[i]; if (!f || f.cuna == null || !f.dte) continue;
    const v = [];
    for (let j = i - 1; j >= 0 && v.length < 60; j--) if (ret[j] != null) v.push(ret[j]);
    if (v.length < 48) continue;
    const s = sd(v); if (!(s > 0)) continue;
    coc[i] = f.cuna / (s * Math.sqrt(Math.max(1, f.dte * 252 / 365)));
  }
  const pc = new Array(dias.length).fill(null);
  for (let i = 0; i < dias.length; i++) {
    if (coc[i] == null) continue;
    let n = 0, men = 0;
    for (let j = Math.max(0, i - VENT_PCTL); j < i; j++) { if (coc[j] == null) continue; n++; if (coc[j] < coc[i]) men++; }
    if (n >= MIN_PCTL) pc[i] = men / n;
  }

  for (const i of entradasIdx) {
    const f = serie[i]; if (!f || !f.exp) continue;
    const c = cadena(sym, dias[i]); if (!c) continue;
    const iSal = i + ENV.salida;
    if (dias[iSal] == null) continue;
    let ds = dias[iSal];
    if (ds >= f.exp) ds = f.exp;
    const cs = cadena(sym, ds); if (!cs) continue;
    const grupo = cs[f.exp]; if (!grupo) continue;
    for (const tipo of ["C", "P"]) {
      const ct = contratoEsquina(c, f.exp, f.S, ENV.dist, tipo);
      if (!ct) continue;
      const rj = reajuste(c[f.exp], grupo, tipo);
      const hay = grupo[ct.clave] != null;
      const salida = grupo[ct.clave]?.[0] ?? 0;
      let recuperado = null, kAdj = null;
      if (rj.hay && rj.factor) {
        const ksT = strikesDe(grupo, tipo);
        const obj = ct.K * rj.factor;
        const kk = ksT.length ? ksT.reduce((a, b) => (Math.abs(b - obj) < Math.abs(a - obj) ? b : a)) : null;
        if (kk != null && Math.abs(kk - obj) < 1e-6 * Math.max(1, obj)) {
          recuperado = (grupo[`${kk}|${tipo}`]?.[0] ?? 0) / rj.factor;
          kAdj = kk;
        }
        REAJ.push({ sym, dia: dias[i], tipo, exp: f.exp, dsal: ds, K: ct.K, superv: rj.superv, factor: rj.factor, encaje: rj.encaje, kAdj, recuperado, ask: ct.ask });
      } else if (rj.hay) {
        REAJ.push({ sym, dia: dias[i], tipo, exp: f.exp, dsal: ds, K: ct.K, superv: rj.superv, factor: null, encaje: rj.encaje, kAdj: null, recuperado: null, ask: ct.ask });
      }
      OPS.push({
        sym, dia: dias[i], ano: dias[i].slice(0, 4), tipo, K: ct.K, ask: ct.ask, salida, hay,
        ret: (salida - ct.ask) / ct.ask,
        retRec: recuperado != null ? (recuperado - ct.ask) / ct.ask : (salida - ct.ask) / ct.ask,
        reaj: rj.hay, recuperable: recuperado != null, factor: rj.factor,
        senal: pc[i] != null && pc[i] > 0.80, tieneSenal: pc[i] != null,
      });
    }
  }
  cache.clear();
  process.stderr.write(`\r   ${sym} · ${num(OPS.length)} · ${Math.round((Date.now() - t0) / 1000)}s   `);
}
process.stderr.write("\n");

const acc = (v, campo = "ret") => {
  const a = { n: 0, win: 0, gan: 0, per: 0 };
  for (const o of v) { const d = APUESTA * o[campo]; a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; }
  return a;
};
const ratio = (a) => (a.per > 0 ? a.gan / a.per : NaN);
const acierto = (a) => (a.n ? a.win / a.n : NaN);
const RA = (a) => `${ratio(a).toFixed(2)} / ${pct(acierto(a))}`;

console.log(`\n══ 1) LOS REAJUSTES DE VERDAD — la rejilla vieja desaparece ══`);
console.log(`  operaciones del envase A: ${num(OPS.length)} · cruzan un reajuste real: ${num(OPS.filter((o) => o.reaj).length)} (${pct(OPS.filter((o) => o.reaj).length / OPS.length)})`);
console.log(`  con contrato equivalente encontrado: ${num(OPS.filter((o) => o.recuperable).length)} · sin factor de bolsa que encaje (se quedan sin valorar): ${num(OPS.filter((o) => o.reaj && !o.recuperable).length)}`);
console.log(`\n  | ticker | día compra | lado | strike | sobreviven strikes | factor | strike nuevo | se contó | de verdad |`);
console.log(`  |---|---|---|---|---|---|---|---|---|`);
for (const r of REAJ.sort((a, b) => (a.sym + a.dia).localeCompare(b.sym + b.dia))) {
  const retV = r.recuperado != null ? pct((r.recuperado - r.ask) / r.ask) : "SIN VALORAR";
  console.log(`  | ${r.sym} | ${r.dia} | ${r.tipo} | ${r.K} | ${pct(r.superv)} | ${r.factor ? "×" + r.factor.toFixed(3) : "no encaja"} | ${r.kAdj ?? "—"} | −100.0% | ${retV} |`);
}

console.log(`\n══ 2) ¿CAMBIA ALGO? — las tres versiones ══`);
{
  const base = OPS.filter((o) => o.tieneSenal), sel = base.filter((o) => o.senal);
  console.log(`  | versión | CON señal (>80) | SIN señal | mejora |`);
  console.log(`  |---|---|---|---|`);
  const casos = [
    ["tal como está en el hallazgo (el hueco del split = pérdida total)", "ret", () => true],
    ["con el contrato reajustado, valorado con su puja real", "retRec", () => true],
    ["tirando las operaciones que cruzan un reajuste (regla 3 de la casa)", "ret", (o) => !o.reaj],
  ];
  for (const [et, campo, filtro] of casos) {
    const s = acc(sel.filter(filtro), campo), l = acc(base.filter(filtro), campo);
    console.log(`  | ${et} | **${RA(s)}** (n=${num(s.n)}) | ${RA(l)} (n=${num(l.n)}) | ${(ratio(s) - ratio(l)).toFixed(2)} |`);
  }
  console.log(`\n  Lo mismo, SIN 2020:`);
  console.log(`  | versión | CON señal (>80) | SIN señal | mejora |`);
  console.log(`  |---|---|---|---|`);
  for (const [et, campo, filtro] of casos) {
    const s = acc(sel.filter((o) => o.ano !== "2020").filter(filtro), campo), l = acc(base.filter((o) => o.ano !== "2020").filter(filtro), campo);
    console.log(`  | ${et} | **${RA(s)}** (n=${num(s.n)}) | ${RA(l)} | ${(ratio(s) - ratio(l)).toFixed(2)} |`);
  }
}

console.log(`\n══ 3) META — dos empresas distintas en el mismo fichero ══`);
{
  const base = OPS.filter((o) => o.tieneSenal), sel = base.filter((o) => o.senal);
  const m = OPS.filter((o) => o.sym === "META");
  console.log(`  operaciones bajo META: ${num(m.length)} · antes del 2022-06-09: ${num(m.filter((o) => o.dia < "20220609").length)} · después: ${num(m.filter((o) => o.dia >= "20220609").length)}`);
  const s1 = acc(sel), l1 = acc(base);
  const s2 = acc(sel.filter((o) => o.sym !== "META")), l2 = acc(base.filter((o) => o.sym !== "META"));
  console.log(`  con META: con señal ${RA(s1)} · sin señal ${RA(l1)} · mejora ${(ratio(s1) - ratio(l1)).toFixed(2)}`);
  console.log(`  sin META: con señal ${RA(s2)} · sin señal ${RA(l2)} · mejora ${(ratio(s2) - ratio(l2)).toFixed(2)}`);
  const gm = acc(sel.filter((o) => o.sym === "META"));
  console.log(`  META aporta al grupo de la señal ${num(gm.n)} operaciones · ganado ${usd(gm.gan)} · perdido ${usd(gm.per)}`);
}
console.log("");
