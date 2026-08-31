// ⛔⛔ ESTE SCRIPT ESTÁ MAL Y SUS NÚMEROS NO SIRVEN. NO USAR. ⛔⛔
//
// Detecta el split comparando el strike MEDIANO de la cadena entre dos días. Eso está mal: cuando
// una acción sube, la bolsa AÑADE strikes más altos y el mediano se mueve solo, sin que haya
// habido ningún split. Con ese detector salen "splits" de AAPL en 2017 y de TSLA cada dos semanas,
// y al "recuperar" el contrato equivalente compara una put de 100 con una put de 150 — o sea que
// FABRICA ganancias del 3.800%. Datos inventados: prohibidos por la regla 2 de la casa.
//
// La versión buena es scripts/y2-lente2-splits-bien-detectados.mjs, que detecta el split por si
// los strikes VIEJOS siguen existiendo (un split los borra; añadir strikes nuevos no).
// Se deja aquí sólo como registro del fallo.
//
// ¿HAY SPLITS Y TICKERS CAMBIADOS DENTRO DE LAS OPERACIONES? — y si los hay, ¿a quién le pegan?
//
// ═══ POR QUÉ ════════════════════════════════════════════════════════════════════════════════
//
// El libro busca la salida por la CLAVE del contrato: "915|C". Cuando una acción hace un split,
// la bolsa reajusta el contrato: un 10 a 1 convierte el strike 915 en el strike 91.5 y una
// posición de 1 contrato en 10. La clave "915|C" DESAPARECE del fichero — y el código lee ese
// hueco como cero, o sea pérdida total.
//
// Eso es grave justo donde más duele: los splits pasan DESPUÉS de una subida fuerte, que es
// exactamente cuando una call comprada 10% fuera del dinero es la ganadora gorda. O sea que el
// backtest puede estar BORRANDO GANADORAS. (Borrar ganadoras baja el ratio, no lo sube, así que
// no fabrica el hallazgo — pero hay que ver si le pega más a un grupo que a otro.)
//
// Y hay un segundo problema: el fichero de META antes de junio de 2022 no es Meta Platforms.
// El 2022-01-03 la cadena de META tiene strikes de 7 a 16 dólares; el 2022-02-14 los tiene de
// 100 a 332. Son dos empresas distintas metidas en la misma serie. Eso rompe los retornos, el
// percentil y las operaciones que cruzan la frontera.
//
// ═══ CÓMO SE DETECTA EL SPLIT, SIN DATOS DE FUERA ═══════════════════════════════════════════
//
// Con la propia rejilla de strikes: se coge el MISMO vencimiento el día de la compra y el día
// de la salida, y se compara el strike mediano publicado. Si la rejilla entera se ha dividido
// por 10, ha habido un split de 10 a 1. Sin modelos y sin datos externos.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y2-lente2-splits-y-tickers-rotos.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const ENV = { dist: 0.10, dte: 60, salida: 30 };
const ASKMIN = 0.10, TOLK = 0.50, VENT_PCTL = 250, MIN_PCTL = 150, APUESTA = 1000;
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/d");
const num = (n) => Math.round(n).toLocaleString("en-US");
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };

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

// ── 1) el mapa de reajustes: por ticker, qué días se reescala la rejilla ────
console.log(`\n══ 1) DÓNDE SE REESCALA LA REJILLA DE STRIKES (splits y cambios de identidad) ══`);
console.log(`  Se compara el strike mediano del vencimiento más cercano de un día de cadena al siguiente.`);
console.log(`  | ticker | día | factor | strike mediano antes → después |`);
console.log(`  |---|---|---|---|`);
const SALTOS = new Map();      // sym -> [{dia, factor}]
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  let prev = null, prevDia = null;
  const lista = [];
  for (const d of dias) {
    const c = cadena(sym, d); if (!c) continue;
    let exp = null, md = Infinity;
    for (const e of Object.keys(c)) { const x = dteDe(d, e); if (x < 1) continue; if (x < md) { md = x; exp = e; } }
    if (!exp) continue;
    const ks = strikesDe(c[exp], "C"); if (ks.length < 5) continue;
    const m = mediana(ks);
    if (prev != null && (m / prev < 0.72 || m / prev > 1.38)) {
      lista.push({ dia: d, factor: m / prev, antes: prev, despues: m, prevDia });
      console.log(`  | ${sym} | ${d} | ×${(m / prev).toFixed(3)} | ${prev} → ${m} |`);
    }
    prev = m; prevDia = d;
  }
  if (lista.length) SALTOS.set(sym, lista);
  cache.clear();
}
console.log(`  tickers con al menos un reajuste: ${SALTOS.size} de ${TICKERS.length}`);

// ── 2) las operaciones, marcando las que cruzan un reajuste ────────────────
const OPS = [];
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
  const saltos = SALTOS.get(sym) ?? [];

  for (const i of entradasIdx) {
    const f = serie[i]; if (!f || !f.exp) continue;
    const c = cadena(sym, dias[i]); if (!c) continue;
    const iSal = i + ENV.salida;
    if (dias[iSal] == null) continue;
    let ds = dias[iSal];
    if (ds >= f.exp) ds = f.exp;
    const cs = cadena(sym, ds); if (!cs) continue;
    const grupo = cs[f.exp]; if (!grupo) continue;
    // ¿se reescaló la rejilla de ESTE vencimiento entre la compra y la salida?
    const kEnt = strikesDe(c[f.exp], "C"), kSal = strikesDe(grupo, "C");
    let factor = 1;
    if (kEnt.length >= 5 && kSal.length >= 5) factor = mediana(kSal) / mediana(kEnt);
    const reajustado = saltos.some((s) => s.dia > dias[i] && s.dia <= ds) || factor < 0.72 || factor > 1.38;

    for (const tipo of ["C", "P"]) {
      const ct = contratoEsquina(c, f.exp, f.S, ENV.dist, tipo);
      if (!ct) continue;
      const hay = grupo[ct.clave] != null;
      const salida = grupo[ct.clave]?.[0] ?? 0;
      // el valor RECUPERADO: si hubo split, el contrato equivalente es el strike × factor,
      // y una posición de 1 contrato pasa a ser 1/factor contratos.
      let recuperado = null, kAdj = null;
      if (reajustado && factor > 0 && Math.abs(factor - 1) > 0.05) {
        const objetivo = ct.K * factor;
        const ksT = strikesDe(grupo, tipo);
        if (ksT.length) {
          const kk = ksT.reduce((a, b) => (Math.abs(b - objetivo) < Math.abs(a - objetivo) ? b : a));
          if (Math.abs(kk / objetivo - 1) < 0.02) { kAdj = kk; recuperado = (grupo[`${kk}|${tipo}`]?.[0] ?? 0) / factor; }
        }
      }
      OPS.push({
        sym, dia: dias[i], ano: dias[i].slice(0, 4), tipo, K: ct.K, ask: ct.ask, salida, hay,
        ret: (salida - ct.ask) / ct.ask,
        retRec: recuperado != null ? (recuperado - ct.ask) / ct.ask : (salida - ct.ask) / ct.ask,
        reajustado, factor, kAdj, recuperado, dsal: ds, exp: f.exp,
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

console.log(`\n══ 2) CUÁNTAS OPERACIONES CRUZAN UN REAJUSTE ══`);
const rea = OPS.filter((o) => o.reajustado);
console.log(`  operaciones del envase A: ${num(OPS.length)} · cruzan un reajuste: ${num(rea.length)} (${pct(rea.length / OPS.length)})`);
console.log(`  de esas, con la clave PERDIDA y leídas como cero: ${num(rea.filter((o) => !o.hay).length)}`);
console.log(`  de esas, con contrato equivalente encontrado y recuperable: ${num(rea.filter((o) => o.recuperado != null).length)}`);
{
  const rec = rea.filter((o) => o.recuperado != null && !o.hay);
  const gan = rec.filter((o) => o.retRec > 0);
  console.log(`  recuperadas que en realidad eran GANADORAS y se contaban como pérdida total: ${num(gan.length)}`);
  for (const o of gan.sort((a, b) => b.retRec - a.retRec).slice(0, 12)) {
    console.log(`    ${o.sym} ${o.dia} ${o.tipo} strike ${o.K} → ${o.kAdj} (×${o.factor.toFixed(3)}) · se contó 0 (−100%), de verdad ${pct(o.retRec)} · ${o.senal ? "CON señal" : "sin señal"}`);
  }
}

console.log(`\n══ 3) ¿A QUIÉN LE PEGA? — la señal contra el resto ══`);
{
  const base = OPS.filter((o) => o.tieneSenal);
  const sel = base.filter((o) => o.senal);
  console.log(`  operaciones que cruzan reajuste: ${pct(sel.filter((o) => o.reajustado).length / sel.length)} en el grupo de la señal · ${pct(base.filter((o) => !o.senal && o.reajustado).length / base.filter((o) => !o.senal).length)} fuera`);
  console.log(`\n  | versión | CON señal (>80): ratio / acierta | SIN señal: ratio / acierta | mejora |`);
  console.log(`  |---|---|---|---|`);
  const f1 = [["tal como está en el hallazgo (el hueco del split = pérdida total)", "ret", () => true],
              ["con el contrato reajustado, valorado de verdad", "retRec", () => true],
              ["tirando las operaciones que cruzan un reajuste", "ret", (o) => !o.reajustado]];
  for (const [et, campo, filtro] of f1) {
    const s = acc(sel.filter(filtro), campo), l = acc(base.filter(filtro), campo);
    console.log(`  | ${et} | **${RA(s)}** (n=${num(s.n)}) | ${RA(l)} | ${(ratio(s) - ratio(l)).toFixed(2)} |`);
  }
}

console.log(`\n══ 4) META — dos empresas en la misma serie ══`);
{
  const m = OPS.filter((o) => o.sym === "META");
  const antes = m.filter((o) => o.dia < "20220609"), desp = m.filter((o) => o.dia >= "20220609");
  console.log(`  operaciones bajo el fichero META: ${num(m.length)} · antes del 2022-06-09 (otra empresa): ${num(antes.length)} · después (Meta Platforms): ${num(desp.length)}`);
  const base = OPS.filter((o) => o.tieneSenal), sel = base.filter((o) => o.senal);
  const s1 = acc(sel), l1 = acc(base);
  const s2 = acc(sel.filter((o) => o.sym !== "META")), l2 = acc(base.filter((o) => o.sym !== "META"));
  console.log(`  con META    : con señal ${RA(s1)} (n=${num(s1.n)}) · sin señal ${RA(l1)} · mejora ${(ratio(s1) - ratio(l1)).toFixed(2)}`);
  console.log(`  sin META    : con señal ${RA(s2)} (n=${num(s2.n)}) · sin señal ${RA(l2)} · mejora ${(ratio(s2) - ratio(l2)).toFixed(2)}`);
  const gm = acc(sel.filter((o) => o.sym === "META"));
  console.log(`  lo que aporta META al grupo de la señal: ${num(gm.n)} operaciones · ganado ${usd(gm.gan)} · perdido ${usd(gm.per)}`);
}

console.log(`\n══ 5) LA VERSIÓN LIMPIA — sin META y con los splits valorados de verdad ══`);
{
  const base = OPS.filter((o) => o.tieneSenal && o.sym !== "META");
  const sel = base.filter((o) => o.senal);
  const s = acc(sel, "retRec"), l = acc(base, "retRec");
  console.log(`  con señal ${RA(s)} (n=${num(s.n)}) · sin señal ${RA(l)} (n=${num(l.n)}) · mejora ${(ratio(s) - ratio(l)).toFixed(2)}`);
  const s20 = acc(sel.filter((o) => o.ano !== "2020"), "retRec"), l20 = acc(base.filter((o) => o.ano !== "2020"), "retRec");
  console.log(`  sin 2020: con señal ${RA(s20)} (n=${num(s20.n)}) · sin señal ${RA(l20)} · mejora ${(ratio(s20) - ratio(l20)).toFixed(2)}`);
  const s21 = acc(sel.filter((o) => o.ano >= "2021"), "retRec"), l21 = acc(base.filter((o) => o.ano >= "2021"), "retRec");
  console.log(`  sólo 2021-2026: con señal ${RA(s21)} (n=${num(s21.n)}) · sin señal ${RA(l21)} · mejora ${(ratio(s21) - ratio(l21)).toFixed(2)}`);
  console.log(`\n  | año | n | CON señal | SIN señal |`);
  console.log(`  |---|---|---|---|`);
  for (const y of [...new Set(base.map((o) => o.ano))].sort()) {
    const a = acc(sel.filter((o) => o.ano === y), "retRec"), b = acc(base.filter((o) => o.ano === y), "retRec");
    if (a.n < 20) { console.log(`  | ${y} | ${a.n} | muestra corta | |`); continue; }
    console.log(`  | ${y} | ${a.n} | **${ratio(a).toFixed(2)}** | ${ratio(b).toFixed(2)} |`);
  }
}
console.log("");
