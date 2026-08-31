// ¿UN HUECO SE ESTÁ LEYENDO COMO UN CERO? — la comprobación que exige la regla 3 de la casa.
//
// En el libro del hallazgo, el 37.8% de las operaciones del envase A "vencen sin valor". Al
// contarlas se ve que el 100% de esos ceros vienen de que EL STRIKE NO ESTÁ en el fichero de
// la cadena del día de salida — ni una sola viene de un contrato presente con puja de 0.
//
// Eso puede ser lo correcto (si el descargador tira los contratos sin puja, desaparecer ES
// valer cero) o puede ser un agujero (si al contrato le falta la cotización ese día por otro
// motivo). La forma de distinguirlo es mirar DÓNDE ESTABA EL PRECIO el día de la salida:
//
//   · un contrato FUERA DEL DINERO que desaparece: creíble que valga cero.
//   · un contrato DENTRO DEL DINERO que desaparece: IMPOSIBLE que valga cero — una call con
//     el strike por debajo del precio vale al menos la diferencia. Si eso pasa, el backtest
//     está borrando ganadoras y el número está mal.
//
// Se mide además si el agujero cae más en el grupo de la señal que en el resto: si la señal
// eligiera días con la cadena más completa, la "ventaja" sería del fichero y no del mercado.
//
// El precio del día de salida se saca con la MISMA paridad put-call del vencimiento MÁS
// CERCANO (versión corregida). Ningún modelo de precios.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y2-lente2-huecos-vs-ceros.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const ENV = { dist: 0.10, dte: 60, salida: 30 };
const ASKMIN = 0.10, TOLK = 0.50, VENT_PCTL = 250, MIN_PCTL = 150;
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/d");
const num = (n) => Math.round(n).toLocaleString("en-US");

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

// ── 1) ¿existe algún contrato con puja 0 en los ficheros? ───────────────────
{
  let tot = 0, b0 = 0, a0 = 0, ficheros = 0, minBid = Infinity, minAsk = Infinity;
  const todos = readdirSync(CDIR).filter((f) => /\.json$/.test(f));
  for (let i = 0; i < todos.length; i += 97) {          // muestra sistemática, 1 de cada 97
    const c = JSON.parse(readFileSync(`${CDIR}/${todos[i]}`, "utf8"));
    ficheros++;
    for (const e of Object.keys(c)) for (const v of Object.values(c[e])) {
      tot++;
      if (v[0] === 0) b0++;
      if (v[1] === 0) a0++;
      if (v[0] < minBid) minBid = v[0];
      if (v[1] < minAsk) minAsk = v[1];
    }
  }
  console.log(`\n══ 1) ¿HAY CONTRATOS CON PUJA CERO EN LOS FICHEROS? ══`);
  console.log(`  muestra: ${num(ficheros)} ficheros de ${num(todos.length)} · ${num(tot)} contratos`);
  console.log(`  con bid = 0: ${num(b0)} (${pct(b0 / tot)})  ·  con ask = 0: ${num(a0)} (${pct(a0 / tot)})`);
  console.log(`  el bid más bajo que aparece: $${minBid}  ·  el ask más bajo: $${minAsk}`);
  console.log(`  → si aquí sale CERO contratos con bid 0, el descargador tira lo que no tiene puja`);
  console.log(`    y "no está en el fichero" es la ÚNICA forma en que un contrato puede valer cero.`);
}

// ── 2) las operaciones del envase A, con el precio del día de salida ────────
const filas = [];
const t0 = Date.now();
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const serie = []; const vistos = new Set(); const entradasIdx = [];
  for (let i = 0; i < dias.length; i++) {
    const d = dias[i]; const c = cadena(sym, d);
    if (!c) { serie.push(null); continue; }
    const S = spotOk(c, d);
    if (!S) { serie.push(null); continue; }
    const eo = expObjetivo(c, d, ENV.dte);
    const fila = { d, S, exp: eo?.exp ?? null, dte: eo?.dte ?? null, cuna: eo ? cunaDe(c, eo.exp, S) : null };
    serie.push(fila);
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
    for (const tipo of ["C", "P"]) {
      const ct = contratoEsquina(c, f.exp, f.S, ENV.dist, tipo);
      if (!ct) continue;
      if (dias[iSal] == null) continue;
      let ds = dias[iSal];
      if (ds >= f.exp) ds = f.exp;
      const cs = cadena(sym, ds); if (!cs) continue;
      const grupo = cs[f.exp]; if (!grupo) continue;
      const Ssal = spotOk(cs, ds);                       // el precio EL DÍA DE LA SALIDA
      const hay = grupo[ct.clave] != null;
      // ¿hasta dónde llega la lista de strikes de ESE vencimiento ese día?
      const ks = Object.keys(grupo).filter((x) => x.slice(-1) === tipo).map((x) => Number(x.slice(0, -2)));
      const kmin = Math.min(...ks), kmax = Math.max(...ks);
      filas.push({
        sym, dia: dias[i], ano: dias[i].slice(0, 4), tipo, K: ct.K, ask: ct.ask,
        hay, Ssal, dsal: ds, exp: f.exp, kmin, kmax,
        dentro: ct.K >= kmin && ct.K <= kmax,            // el strike cae dentro del rango publicado
        moneySal: Ssal ? (tipo === "C" ? Ssal / ct.K - 1 : ct.K / Ssal - 1) : null, // >0 = DENTRO del dinero
        senal: pc[i] != null && pc[i] > 0.80, tieneSenal: pc[i] != null,
        vence: ds === f.exp,
      });
    }
  }
  cache.clear();
  process.stderr.write(`\r   ${sym} · ${num(filas.length)} · ${Math.round((Date.now() - t0) / 1000)}s   `);
}
process.stderr.write("\n");

// ── 3) el veredicto ────────────────────────────────────────────────────────
const ceros = filas.filter((f) => !f.hay);
const conS = filas.filter((f) => f.moneySal != null);
console.log(`\n══ 2) LAS SALIDAS LEÍDAS COMO CERO — ¿estaban dentro o fuera del dinero? ══`);
console.log(`  operaciones del envase A: ${num(filas.length)} · leídas como cero (el strike no está): ${num(ceros.length)} (${pct(ceros.length / filas.length)})`);
const cerosS = ceros.filter((f) => f.moneySal != null);
console.log(`  de esos ceros, con precio del día de salida deducible: ${num(cerosS.length)}`);
const itm = cerosS.filter((f) => f.moneySal > 0);
const cerca = cerosS.filter((f) => f.moneySal > -0.02 && f.moneySal <= 0);
console.log(`\n  DENTRO DEL DINERO al salir (IMPOSIBLE que valgan cero): ${num(itm.length)} (${pct(itm.length / cerosS.length)} de los ceros)`);
console.log(`  a menos del 2% de estar dentro (zona de duda)        : ${num(cerca.length)} (${pct(cerca.length / cerosS.length)})`);
console.log(`  claramente FUERA del dinero (el cero es creíble)     : ${num(cerosS.length - itm.length - cerca.length)} (${pct((cerosS.length - itm.length - cerca.length) / cerosS.length)})`);
{
  const m = cerosS.map((f) => f.moneySal).sort((a, b) => a - b);
  console.log(`  lo fuera del dinero que estaban: mediana ${pct(m[m.length >> 1])} · el 10% menos fuera ${pct(m[Math.floor(m.length * 0.9)])} · el 1% menos fuera ${pct(m[Math.floor(m.length * 0.99)])}`);
  console.log(`  (número positivo = DENTRO del dinero; negativo = fuera)`);
}
console.log(`  ¿el strike caía dentro de la lista publicada de strikes de ese día? ${num(ceros.filter((f) => f.dentro).length)} de ${num(ceros.length)} (${pct(ceros.filter((f) => f.dentro).length / ceros.length)})`);
console.log(`  → si casi todos caen DENTRO del rango publicado, no es que el fichero esté recortado:`);
console.log(`    es que ese contrato concreto se cayó por no tener puja. Eso es valer cero.`);

console.log(`\n══ 3) ¿EL AGUJERO CAE MÁS EN EL GRUPO DE LA SEÑAL? ══`);
{
  const base = filas.filter((f) => f.tieneSenal);
  const sel = base.filter((f) => f.senal), resto = base.filter((f) => !f.senal);
  console.log(`  operaciones con señal disponible: ${num(base.length)}`);
  console.log(`  leídas como cero DENTRO del grupo de la señal (percentil > 80): ${pct(sel.filter((f) => !f.hay).length / sel.length)} (n=${num(sel.length)})`);
  console.log(`  leídas como cero FUERA  del grupo de la señal                : ${pct(resto.filter((f) => !f.hay).length / resto.length)} (n=${num(resto.length)})`);
  const itmSel = sel.filter((f) => !f.hay && f.moneySal > 0).length;
  const itmRes = resto.filter((f) => !f.hay && f.moneySal > 0).length;
  console.log(`  ceros IMPOSIBLES (dentro del dinero) en el grupo de la señal: ${num(itmSel)} · fuera: ${num(itmRes)}`);
}

console.log(`\n══ 4) LAS PEORES — las diez que más dentro del dinero estaban y se leyeron cero ══`);
{
  const peores = cerosS.filter((f) => f.moneySal > 0).sort((a, b) => b.moneySal - a.moneySal).slice(0, 10);
  if (!peores.length) console.log(`  ninguna. No hay ni un solo cero leído sobre un contrato dentro del dinero.`);
  for (const f of peores) console.log(`  ${f.sym} ${f.dia} ${f.tipo} strike ${f.K} · sale el ${f.dsal} con el precio en ${f.Ssal?.toFixed(2)} · ${pct(f.moneySal)} DENTRO · rango publicado ${f.kmin}-${f.kmax} · vencimiento ${f.exp}`);
}
console.log("");
