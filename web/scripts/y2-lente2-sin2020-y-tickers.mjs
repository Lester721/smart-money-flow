// LENTE 2 — ¿ES SÓLO 2020, O SÓLO UNOS POCOS TICKERS?
//
// ═══ QUÉ SE MIRA AQUÍ ═══════════════════════════════════════════════════════════════════════
//
// El hallazgo de scripts/y2-esta-barata-la-opcion.mjs dice: comprar sólo cuando la opción está
// CARA contra lo que la acción se mueve de verdad (el quinto más caro de su propia historia)
// sube el ratio del envase A de 1.11 a 1.67. Aquí se le quita el suelo a ver si se cae:
//
//   1) ¿sobrevive sin febrero-mayo de 2020? ¿y sin TODO 2020? ¿y sin 2020 y 2016 juntos?
//   2) ¿sobrevive en 2018, 2022 y 2025 por separado — y MEJORA al envase sin señal en cada uno?
//   3) ¿cuántos tickers hacen falta para juntar la mitad de lo ganado, y qué pasa quitando los
//      tres mejores? Comparado SIEMPRE contra la misma cuenta del envase sin señal: si el envase
//      de fábrica ya necesita 8 tickers, que la señal necesite 8 no es concentración.
//   4) LA DISTINCIÓN QUE PIDE EL ENCARGO: que pocos EVENTOS aporten mucho es el diseño de una
//      estrategia convexa y no es una pega. Que un solo TICKER o un solo AÑO lo sostenga todo sí
//      lo es. Se miden las dos cosas por separado y se comparan con el envase sin señal.
//   5) Se deja fuera cada ticker de uno en uno (40 pruebas) y cada año de uno en uno (11): el
//      PEOR resultado de esas pruebas es el que manda.
//
// ═══ EL CONTROL BARAJADO, CON 12 TIRADAS, NO CON UNA ════════════════════════════════════════
//
// En este proyecto ya se retiró un hallazgo por un barajado de una sola tirada. Aquí la misma
// regla se aplica con la señal que le tocaba a la entrada de 3, 5, 7, 11, 13, 17, 19, 23, 25,
// 29, 31 y 37 meses antes del MISMO ticker. Doce tiradas dan un abanico, no un número suelto, y
// además tienen el mismo tamaño de muestra que la señal de verdad — así la cuenta de "cuántos
// tickers juntan la mitad" se compara contra algo del mismo tamaño y no contra la muestra entera.
//
// ═══ LO QUE SE COPIA TAL CUAL DEL ORIGINAL ══════════════════════════════════════════════════
//   · el envase A (10% fuera, 60 días, salir a los 30 de bolsa) y el B (5%, 90 días, 30).
//   · el spot por paridad put-call SÓLO EN EL VENCIMIENTO MÁS CERCANO (la versión corregida).
//   · se compra al ASK y se vende al BID. Ningún modelo de precios.
//   · un hueco no es un cero: si falta la cadena de salida o el vencimiento entero, se descarta.
//   · sólo el pasado: los retornos terminan el día ANTERIOR y el percentil se calcula contra los
//     250 días anteriores sin incluir hoy.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y2-lente2-sin2020-y-tickers.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const CACHE_OPS = "scripts/_y2lente2-ops.json";

const ENVASES = {
  A: { dist: 0.10, dte: 60, salida: 30, etiqueta: "A · 10% fuera · 60 días · salir a los 30 de bolsa" },
  B: { dist: 0.05, dte: 90, salida: 30, etiqueta: "B · 5% fuera · 90 días · salir a los 30 de bolsa" },
};
const ASKMIN = 0.10;
const TOLK = 0.50;
const APUESTA = 1000;
const VENTANAS_RV = [60, 120];
const VENT_PCTL = 250;
const MIN_PCTL = 150;
const DESPLS = [3, 5, 7, 11, 13, 17, 19, 23, 25, 29, 31, 37];   // doce barajados, todos fijos
const ANOSCAL = 10.6;

const tolDte = (d) => Math.max(6, Math.round(d * 0.28));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/d");
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const num = (n) => Math.round(n).toLocaleString("en-US");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);

// ════════════════════════════════════════════════════════════════════════════
// EL LIBRO DE OPERACIONES (se construye una vez y se guarda en disco)
// ════════════════════════════════════════════════════════════════════════════
function construir() {
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
      const x = Math.abs(dt - objetivo);
      if (x < md) { md = x; mejor = e; dtReal = dt; }
    }
    if (!mejor || md > tolDte(objetivo)) return null;
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
    const askC = g[`${K}|C`][1], askP = g[`${K}|P`][1];
    if (!(askC > 0) || !(askP > 0)) return null;
    return (askC + askP) / S;
  }
  function contratoEsquina(c, exp, S, dist, tipo) {
    const g = c[exp]; if (!g) return null;
    const objetivo = tipo === "C" ? S * (1 + dist) : S * (1 - dist);
    let mej = null, dm = Infinity;
    for (const [cl, ba] of Object.entries(g)) {
      if (cl.slice(-1) !== tipo) continue;
      if (!(ba[1] >= ASKMIN)) continue;
      const K = Number(cl.slice(0, -2));
      const d = Math.abs(K - objetivo);
      if (d < dm) { dm = d; mej = { K, clave: cl, bid: ba[0], ask: ba[1] }; }
    }
    if (!mej) return null;
    const distReal = tipo === "C" ? mej.K / S - 1 : 1 - mej.K / S;
    if (Math.abs(distReal - dist) > dist * TOLK) return null;
    return { ...mej, distReal };
  }

  const OPS = [];
  const san = { entradas: 0, sinSpot: 0, sinContrato: 0, huecos: 0, cero: 0, faltaStrike: 0, trunc: 0, retSalt: 0, retTot: 0 };
  const audSpot = [];
  const t0 = Date.now();

  for (const sym of TICKERS) {
    const dias = diasPorSim.get(sym);
    const cl = existsSync(`${CIERRES}/${sym}.json`) ? JSON.parse(readFileSync(`${CIERRES}/${sym}.json`, "utf8")) : null;
    const serie = []; const vistos = new Set(); const entradasIdx = [];
    for (let i = 0; i < dias.length; i++) {
      const d = dias[i];
      const c = cadena(sym, d);
      if (!c) { serie.push(null); continue; }
      const S = spotOk(c, d);
      if (!S) { san.sinSpot++; serie.push(null); continue; }
      if (cl && cl[d] > 0) audSpot.push(Math.abs(S / cl[d] - 1));
      const fila = { d, S, cuna: {}, dte: {}, exp: {} };
      for (const [k, e] of Object.entries(ENVASES)) {
        const eo = expObjetivo(c, d, e.dte);
        if (!eo) continue;
        fila.exp[k] = eo.exp; fila.dte[k] = eo.dte;
        const u = cunaDe(c, eo.exp, S);
        if (u != null) fila.cuna[k] = u;
      }
      serie.push(fila);
      const mes = d.slice(0, 6);
      if (!vistos.has(mes)) { vistos.add(mes); entradasIdx.push(i); }
    }
    const ret = new Array(dias.length).fill(null);
    for (let i = 1; i < dias.length; i++) {
      const a = serie[i - 1], b = serie[i];
      if (!a || !b) continue;
      if (dteDe(a.d, b.d) > 5) continue;
      const r = Math.log(b.S / a.S); san.retTot++;
      if (Math.abs(r) > 0.35) { san.retSalt++; continue; }
      ret[i] = r;
    }
    const coc = {};
    for (const k of Object.keys(ENVASES)) { coc[k] = {}; for (const w of VENTANAS_RV) coc[k][w] = new Array(dias.length).fill(null); }
    for (let i = 0; i < dias.length; i++) {
      const f = serie[i]; if (!f) continue;
      for (const w of VENTANAS_RV) {
        const v = [];
        for (let j = i - 1; j >= 0 && v.length < w; j--) if (ret[j] != null) v.push(ret[j]);
        if (v.length < Math.round(w * 0.8)) continue;
        const s = sd(v); if (!(s > 0)) continue;
        for (const k of Object.keys(ENVASES)) {
          if (f.cuna[k] == null || !f.dte[k]) continue;
          const diasBolsa = Math.max(1, f.dte[k] * 252 / 365);
          const mov = s * Math.sqrt(diasBolsa);
          if (mov > 0) coc[k][w][i] = f.cuna[k] / mov;
        }
      }
    }
    function percentilar(s) {
      const out = new Array(s.length).fill(null);
      for (let i = 0; i < s.length; i++) {
        if (s[i] == null) continue;
        let n = 0, menores = 0;
        for (let j = Math.max(0, i - VENT_PCTL); j < i; j++) { if (s[j] == null) continue; n++; if (s[j] < s[i]) menores++; }
        if (n < MIN_PCTL) continue;
        out[i] = menores / n;
      }
      return out;
    }
    const pc = {};
    for (const k of Object.keys(ENVASES)) { pc[k] = {}; for (const w of VENTANAS_RV) pc[k][w] = percentilar(coc[k][w]); }

    const porEnvase = { A: [], B: [] };
    for (const i of entradasIdx) {
      const f = serie[i]; if (!f) continue;
      const c = cadena(sym, dias[i]); if (!c) continue;
      san.entradas++;
      for (const [k, e] of Object.entries(ENVASES)) {
        const exp = f.exp[k];
        if (!exp) { san.sinContrato++; continue; }
        const iSal = i + e.salida;
        for (const tipo of ["C", "P"]) {
          const ct = contratoEsquina(c, exp, f.S, e.dist, tipo);
          if (!ct) { san.sinContrato++; continue; }
          if (dias[iSal] == null) { san.huecos++; continue; }
          let ds = dias[iSal], trunc = 0;
          if (ds >= exp) { ds = exp; trunc = 1; san.trunc++; }
          const cs = cadena(sym, ds); if (!cs) { san.huecos++; continue; }
          const grupo = cs[exp]; if (!grupo) { san.huecos++; continue; }
          const hay = grupo[ct.clave] != null;
          if (!hay) san.faltaStrike++;
          const salida = grupo[ct.clave]?.[0] ?? 0;
          if (salida === 0) san.cero++;
          const señal = {};
          for (const w of VENTANAS_RV) señal[w] = pc[k][w][i];
          porEnvase[k].push({
            env: k, sym, dia: dias[i], ano: dias[i].slice(0, 4), mes: dias[i].slice(0, 6), tipo,
            ret: (salida - ct.ask) / ct.ask, ask: ct.ask, salida, faltaStrike: hay ? 0 : 1, trunc,
            s60: señal[60], s120: señal[120],
            coste: ct.ask / f.S, distReal: ct.distReal, horq: (ct.ask - ct.bid) / ct.ask,
            dteReal: f.dte[k], cuna: f.cuna[k] ?? null,
          });
        }
      }
    }
    // el barajado: a cada operación se le pega la señal de la entrada de N meses antes
    for (const k of Object.keys(ENVASES)) {
      const v = porEnvase[k];
      const meses = [...new Set(v.map((o) => o.mes))].sort();
      const idxMes = new Map(meses.map((m, j) => [m, j]));
      const sPorMes = new Map();
      for (const o of v) if (!sPorMes.has(o.mes)) sPorMes.set(o.mes, { s60: o.s60, s120: o.s120 });
      for (const o of v) {
        o.b = {};
        for (const dp of DESPLS) {
          const j = idxMes.get(o.mes) - dp;
          o.b[dp] = j >= 0 ? (sPorMes.get(meses[j]) ?? { s60: null, s120: null }) : { s60: null, s120: null };
        }
      }
      OPS.push(...v);
    }
    cache.clear();
    process.stderr.write(`\r   ${sym} · ${num(OPS.length)} operaciones · ${Math.round((Date.now() - t0) / 1000)}s     `);
  }
  process.stderr.write("\n");
  const s = [...audSpot].sort((a, b) => a - b);
  san.spot = { n: s.length, med: s[s.length >> 1], p90: s[Math.floor(s.length * 0.9)], p99: s[Math.floor(s.length * 0.99)] };
  san.tickers = TICKERS.length;
  return { OPS, san };
}

let LIBRO;
if (existsSync(CACHE_OPS) && !process.env.REHACER) {
  LIBRO = JSON.parse(readFileSync(CACHE_OPS, "utf8"));
  console.log(`\n## libro de operaciones leído de ${CACHE_OPS}`);
} else {
  LIBRO = construir();
  writeFileSync(CACHE_OPS, JSON.stringify(LIBRO));
  console.log(`\n## libro de operaciones construido y guardado en ${CACHE_OPS}`);
}
const { OPS, san } = LIBRO;

// ════════════════════════════════════════════════════════════════════════════
const linea = (t) => console.log(`\n${"═".repeat(108)}\n  ${t}\n${"═".repeat(108)}`);
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
function mide(v) {
  const a = acc();
  for (const o of v) { const d = APUESTA * o.ret; a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; }
  return a;
}
const ratio = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const acierto = (a) => (a.n ? a.win / a.n : NaN);
const R = (a) => (a.n ? ratio(a).toFixed(2) : "n/d");
const RA = (a) => (a.n ? `${ratio(a).toFixed(2)} / ${pct(acierto(a))}` : "n/d");

linea("SANIDAD");
console.log(`  tickers ${san.tickers} · entradas ${num(san.entradas)} · operaciones ${num(OPS.length)}`);
console.log(`  sin spot ${num(san.sinSpot)} · sin contrato que encaje ${num(san.sinContrato)} · HUECOS descartados ${num(san.huecos)} (${pct(san.huecos / (san.huecos + OPS.length))})`);
console.log(`  salidas con bid 0 (vence sin valor — DATO REAL): ${num(san.cero)} (${pct(san.cero / OPS.length)})`);
console.log(`  de esas, el strike NO estaba en la cadena de salida y se leyó 0: ${num(san.faltaStrike)} (${pct(san.faltaStrike / OPS.length)} del total)`);
console.log(`  truncadas al vencimiento: ${num(san.trunc)}`);
console.log(`  retornos diarios saltados por salto > 35%: ${num(san.retSalt)} de ${num(san.retTot)}`);
console.log(`  spot contra los cierres reales (${num(san.spot.n)} días): mediano ${pct(san.spot.med)} · peor 10% ${pct(san.spot.p90)} · peor 1% ${pct(san.spot.p99)}`);
for (const k of Object.keys(ENVASES)) {
  const v = OPS.filter((o) => o.env === k);
  console.log(`\n  ENVASE ${k} — ${ENVASES[k].etiqueta}`);
  console.log(`    n ${num(v.length)} · distancia real ${pct(media(v.map((o) => o.distReal)))} · plazo ${media(v.map((o) => o.dteReal)).toFixed(0)} d · coste de entrada ${pct(media(v.map((o) => o.coste)))} del subyacente`);
  console.log(`    horquilla ${pct(media(v.map((o) => o.horq)))} de la prima · ask medio $${media(v.map((o) => o.ask)).toFixed(2)} · vencen sin valor ${pct(v.filter((o) => o.salida === 0).length / v.length)}`);
}

// ════════════════════════════════════════════════════════════════════════════
// LAS REGLAS QUE SE EXAMINAN
// ════════════════════════════════════════════════════════════════════════════
const REGLAS = [
  { id: "P80-60", et: "el quinto MÁS CARO (percentil > 80) con el movimiento de 60 días", f: (s) => s.s60 != null && s.s60 > 0.80, req: (o) => o.s60 != null },
  { id: "P60-2v", et: "percentil > 60 con las DOS ventanas (60 y 120 días)", f: (s) => s.s60 != null && s.s120 != null && s.s60 > 0.60 && s.s120 > 0.60, req: (o) => o.s60 != null && o.s120 != null },
  { id: "P80-2v", et: "percentil > 80 con las DOS ventanas (60 y 120 días)", f: (s) => s.s60 != null && s.s120 != null && s.s60 > 0.80 && s.s120 > 0.80, req: (o) => o.s60 != null && o.s120 != null },
];

// ── cortes de tiempo ────────────────────────────────────────────────────────
const CORTES = [
  { et: "TODO (2016-2026)", f: () => true },
  { et: "sin febrero-mayo de 2020", f: (o) => !(o.dia >= "20200201" && o.dia <= "20200531") },
  { et: "sin TODO el año 2020", f: (o) => o.ano !== "2020" },
  { et: "sin 2020 y sin 2016 (el año corto)", f: (o) => o.ano !== "2020" && o.ano !== "2016" },
  { et: "sólo 2021-2026 (la mitad reciente)", f: (o) => o.ano >= "2021" },
  { et: "sólo 2023-2026 (el tercio final)", f: (o) => o.ano >= "2023" },
];

function tablaCortes(env, regla) {
  const base = OPS.filter((o) => o.env === env && regla.req(o));
  linea(`ENVASE ${env} · ${regla.et} — EL SUELO QUITADO`);
  console.log(`  | corte | n | ops/año | CON señal: ratio / acierta | SIN señal: ratio / acierta | mejora | barajado (mediana de 12) |`);
  console.log(`  |---|---|---|---|---|---|---|`);
  for (const c of CORTES) {
    const sub = base.filter(c.f);
    const sel = sub.filter((o) => regla.f(o));
    if (sel.length < 60) { console.log(`  | ${c.et} | ${sel.length} | | muestra corta | | | |`); continue; }
    const a = mide(sel), l = mide(sub);
    const bars = DESPLS.map((dp) => mide(sub.filter((o) => regla.f(o.b[dp])))).filter((x) => x.n >= 40).map(ratio).sort((x, y) => x - y);
    const medBar = bars.length ? bars[bars.length >> 1] : NaN;
    const anos = new Set(sub.map((o) => o.ano)).size * (c.et.includes("febrero") ? 0.97 : 1);
    console.log(`  | ${c.et} | ${num(a.n)} | ${(a.n / anos).toFixed(0)} | **${ratio(a).toFixed(2)}** / ${pct(acierto(a))} | ${ratio(l).toFixed(2)} / ${pct(acierto(l))} | ${(ratio(a) - ratio(l) >= 0 ? "+" : "") + (ratio(a) - ratio(l)).toFixed(2)} | ${Number.isFinite(medBar) ? medBar.toFixed(2) : "n/d"} (de ${bars.length ? bars[0].toFixed(2) : "?"} a ${bars.length ? bars[bars.length - 1].toFixed(2) : "?"}) |`);
  }
}

// ── año a año, con listón y con el abanico barajado ────────────────────────
function tablaAnos(env, regla) {
  const base = OPS.filter((o) => o.env === env && regla.req(o));
  const ANOS = [...new Set(base.map((o) => o.ano))].sort();
  linea(`ENVASE ${env} · ${regla.et} — AÑO A AÑO, contra el envase sin señal y contra 12 barajados`);
  console.log(`  | año | n | CON señal | acierta | SIN señal | mejora | barajado: mediana (mín-máx de 12) | ¿la señal gana al barajado? |`);
  console.log(`  |---|---|---|---|---|---|---|---|`);
  let malos = 0, conM = 0, ganaBar = 0;
  for (const y of ANOS) {
    const sub = base.filter((o) => o.ano === y);
    const sel = sub.filter((o) => regla.f(o));
    if (sel.length < 20) { console.log(`  | ${y} | ${sel.length} | muestra corta | | | | | |`); continue; }
    conM++;
    const a = mide(sel), l = mide(sub);
    if (ratio(a) < 1) malos++;
    const bars = DESPLS.map((dp) => mide(sub.filter((o) => regla.f(o.b[dp])))).filter((x) => x.n >= 15).map(ratio).sort((x, y2) => x - y2);
    const mb = bars.length ? bars[bars.length >> 1] : NaN;
    const gana = Number.isFinite(mb) && ratio(a) > mb;
    if (gana) ganaBar++;
    console.log(`  | ${y} | ${a.n} | **${ratio(a).toFixed(2)}** | ${pct(acierto(a))} | ${ratio(l).toFixed(2)} | ${(ratio(a) - ratio(l) >= 0 ? "+" : "") + (ratio(a) - ratio(l)).toFixed(2)} | ${Number.isFinite(mb) ? `${mb.toFixed(2)} (${bars[0].toFixed(2)}-${bars[bars.length - 1].toFixed(2)})` : "n/d"} | ${Number.isFinite(mb) ? (gana ? "sí" : "NO") : "n/d"} |`);
  }
  console.log(`  años por debajo de 1: ${malos} de ${conM} · años en que la señal gana a la mediana de sus barajados: ${ganaBar} de ${conM}`);
  return { malos, conM, ganaBar };
}

// ── concentración: cuántos hacen falta para la mitad del dinero ganado ─────
function cuantosParaMitad(v, clave) {
  const a = mide(v);
  if (!(a.gan > 0)) return { cuantos: NaN, total: 0, top: [] };
  const m = new Map();
  for (const o of v) { const g = APUESTA * o.ret; if (g <= 0) continue; const k = clave(o); m.set(k, (m.get(k) ?? 0) + g); }
  const ord = [...m.entries()].sort((x, y) => y[1] - x[1]);
  let ac = 0, c = 0;
  for (const [, g] of ord) { ac += g; c++; if (ac >= a.gan / 2) break; }
  return { cuantos: c, total: m.size, top: ord.slice(0, 5), gan: a.gan };
}

function tablaConcentracion(env, regla) {
  const base = OPS.filter((o) => o.env === env && regla.req(o));
  const sel = base.filter((o) => regla.f(o));
  const a = mide(sel), l = mide(base);
  linea(`ENVASE ${env} · ${regla.et} — ¿DE DÓNDE SALE EL DINERO?`);

  // 1) EVENTOS: es convexa, se espera concentración. Lo que importa es que NO sea peor que el envase de fábrica.
  const evS = cuantosParaMitad(sel, (o) => `${o.sym}|${o.dia}|${o.tipo}`);
  const evL = cuantosParaMitad(base, (o) => `${o.sym}|${o.dia}|${o.tipo}`);
  console.log(`\n  a) POR OPERACIÓN SUELTA (esto es el DISEÑO de una estrategia convexa, no una pega):`);
  console.log(`     con señal : ${evS.cuantos} operaciones de ${num(a.n)} juntan la mitad de lo ganado (${pct(evS.cuantos / a.n)} de las operaciones)`);
  console.log(`     sin señal : ${evL.cuantos} operaciones de ${num(l.n)} juntan la mitad de lo ganado (${pct(evL.cuantos / l.n)} de las operaciones)`);

  // 2) TICKERS: aquí sí es una pega
  const tkS = cuantosParaMitad(sel, (o) => o.sym);
  const tkL = cuantosParaMitad(base, (o) => o.sym);
  console.log(`\n  b) POR TICKER (aquí sí sería una pega):`);
  console.log(`     con señal : ${tkS.cuantos} tickers juntan la mitad · dispara en ${new Set(sel.map((o) => o.sym)).size} tickers de ${new Set(base.map((o) => o.sym)).size}`);
  console.log(`     sin señal : ${tkL.cuantos} tickers juntan la mitad · ${new Set(base.map((o) => o.sym)).size} tickers`);
  console.log(`     mejores con señal: ${tkS.top.map(([k, g]) => `${k} ${usd(g)}`).join(" · ")}`);

  // 3) AÑOS
  const anS = cuantosParaMitad(sel, (o) => o.ano);
  const anL = cuantosParaMitad(base, (o) => o.ano);
  console.log(`\n  c) POR AÑO (aquí sí sería una pega):`);
  console.log(`     con señal : ${anS.cuantos} años juntan la mitad — ${anS.top.map(([k, g]) => `${k} ${usd(g)}`).join(" · ")}`);
  console.log(`     sin señal : ${anL.cuantos} años juntan la mitad — ${anL.top.map(([k, g]) => `${k} ${usd(g)}`).join(" · ")}`);

  // 4) MESES DE ENTRADA (todas las entradas caen el primer día del mes: las apuestas del mismo mes van juntas)
  const meS = cuantosParaMitad(sel, (o) => o.mes);
  const meL = cuantosParaMitad(base, (o) => o.mes);
  console.log(`\n  d) POR MES DE ENTRADA (todas las compras caen el primer día del mes, así que un mes es UNA apuesta del mercado entero):`);
  console.log(`     con señal : ${meS.cuantos} meses de ${meS.total} juntan la mitad — ${meS.top.map(([k, g]) => `${k} ${usd(g)}`).join(" · ")}`);
  console.log(`     sin señal : ${meL.cuantos} meses de ${meL.total} juntan la mitad`);

  // 5) quitando los N mejores tickers, la misma cuenta en los dos
  console.log(`\n  e) QUITANDO LOS MEJORES TICKERS — la misma poda aplicada a los dos:`);
  console.log(`  | poda | CON señal: n / ratio / acierta | SIN señal: n / ratio / acierta | mejora |`);
  console.log(`  |---|---|---|---|`);
  const ordTk = tkS.top.map(([k]) => k);
  const ordTkFull = [...new Map(sel.map((o) => [o.sym, 0])).keys()]
    .map((s) => ({ s, g: mide(sel.filter((o) => o.sym === s)).gan }))
    .sort((x, y) => y.g - x.g).map((x) => x.s);
  for (const nq of [0, 1, 2, 3, 5]) {
    const fuera = new Set(ordTkFull.slice(0, nq));
    const s2 = mide(sel.filter((o) => !fuera.has(o.sym))), l2 = mide(base.filter((o) => !fuera.has(o.sym)));
    console.log(`  | ${nq === 0 ? "ninguno" : `los ${nq} mejores (${[...fuera].join(", ")})`} | ${num(s2.n)} / **${R(s2)}** / ${pct(acierto(s2))} | ${num(l2.n)} / ${R(l2)} / ${pct(acierto(l2))} | ${(ratio(s2) - ratio(l2) >= 0 ? "+" : "") + (ratio(s2) - ratio(l2)).toFixed(2)} |`);
  }
  void ordTk;

  // 6) LA PRUEBA CRUZADA: sin 2020 Y sin los 3 mejores tickers a la vez
  const fuera3 = new Set(ordTkFull.slice(0, 3));
  const cruz = sel.filter((o) => o.ano !== "2020" && !fuera3.has(o.sym));
  const cruzL = base.filter((o) => o.ano !== "2020" && !fuera3.has(o.sym));
  console.log(`\n  f) LA PRUEBA CRUZADA — sin 2020 Y sin los 3 mejores tickers a la vez:`);
  console.log(`     con señal ${RA(mide(cruz))} (n=${num(mide(cruz).n)}) · sin señal ${RA(mide(cruzL))} · mejora ${(ratio(mide(cruz)) - ratio(mide(cruzL))).toFixed(2)}`);

  // 7) DEJANDO FUERA CADA TICKER DE UNO EN UNO, y cada año de uno en uno
  const tks = [...new Set(base.map((o) => o.sym))];
  const jkT = tks.map((s) => ({ s, r: ratio(mide(sel.filter((o) => o.sym !== s))) })).filter((x) => Number.isFinite(x.r)).sort((x, y) => x.r - y.r);
  const anos = [...new Set(base.map((o) => o.ano))];
  const jkA = anos.map((y) => ({ s: y, r: ratio(mide(sel.filter((o) => o.ano !== y))) })).filter((x) => Number.isFinite(x.r)).sort((x, y) => x.r - y.r);
  console.log(`\n  g) DEJANDO FUERA DE UNO EN UNO (el peor resultado es el que manda):`);
  console.log(`     quitando un TICKER: peor ${jkT[0].r.toFixed(2)} (sin ${jkT[0].s}) · mejor ${jkT[jkT.length - 1].r.toFixed(2)} (sin ${jkT[jkT.length - 1].s}) · ${jkT.filter((x) => x.r >= 1.40).length} de ${jkT.length} siguen en 1.40 o más`);
  console.log(`     quitando un AÑO   : peor ${jkA[0].r.toFixed(2)} (sin ${jkA[0].s}) · mejor ${jkA[jkA.length - 1].r.toFixed(2)} (sin ${jkA[jkA.length - 1].s}) · ${jkA.filter((x) => x.r >= 1.40).length} de ${jkA.length} siguen en 1.40 o más`);
  return { tkS, evS, evL, tkL, jkT, jkA, ordTkFull };
}

// ── el barajado, sin 2020, con las 12 tiradas ──────────────────────────────
function tablaBarajado(env, regla) {
  const base = OPS.filter((o) => o.env === env && regla.req(o));
  linea(`ENVASE ${env} · ${regla.et} — LAS 12 TIRADAS BARAJADAS, CON Y SIN 2020`);
  console.log(`  | tirada (meses de desplazamiento) | TODO: n / ratio | SIN 2020: n / ratio |`);
  console.log(`  |---|---|---|`);
  const real = mide(base.filter((o) => regla.f(o)));
  const realS = mide(base.filter((o) => o.ano !== "2020" && regla.f(o)));
  console.log(`  | **LA SEÑAL DE VERDAD** | ${num(real.n)} / **${R(real)}** | ${num(realS.n)} / **${R(realS)}** |`);
  const rs = [], rss = [];
  for (const dp of DESPLS) {
    const a = mide(base.filter((o) => regla.f(o.b[dp])));
    const b = mide(base.filter((o) => o.ano !== "2020" && regla.f(o.b[dp])));
    if (a.n >= 40) rs.push(ratio(a));
    if (b.n >= 40) rss.push(ratio(b));
    console.log(`  | ${dp} meses | ${num(a.n)} / ${R(a)} | ${num(b.n)} / ${R(b)} |`);
  }
  rs.sort((a, b) => a - b); rss.sort((a, b) => a - b);
  console.log(`  barajados TODO   : mediana ${rs[rs.length >> 1].toFixed(2)} · de ${rs[0].toFixed(2)} a ${rs[rs.length - 1].toFixed(2)} · cuántos llegan al ratio real: ${rs.filter((x) => x >= ratio(real)).length} de ${rs.length}`);
  console.log(`  barajados SIN 2020: mediana ${rss[rss.length >> 1].toFixed(2)} · de ${rss[0].toFixed(2)} a ${rss[rss.length - 1].toFixed(2)} · cuántos llegan al ratio real: ${rss.filter((x) => x >= ratio(realS)).length} de ${rss.length}`);
  return { real, realS, rs, rss };
}

// ════════════════════════════════════════════════════════════════════════════
const RES = {};
for (const regla of REGLAS) {
  for (const env of ["A", "B"]) {
    tablaCortes(env, regla);
  }
  const anosA = tablaAnos("A", regla);
  const conA = tablaConcentracion("A", regla);
  const barA = tablaBarajado("A", regla);
  RES[regla.id] = { anosA, conA, barA };
}
// el envase B en detalle sólo para la regla principal
tablaAnos("B", REGLAS[0]);
tablaConcentracion("B", REGLAS[0]);

// ── calls y puts dentro de los cortes que importan ─────────────────────────
linea("EL LADO — calls y puts por separado dentro de cada corte (envase A, regla principal)");
console.log(`  | corte | lado | n | CON señal | acierta | SIN señal |`);
console.log(`  |---|---|---|---|---|---|`);
{
  const regla = REGLAS[0];
  const base = OPS.filter((o) => o.env === "A" && regla.req(o));
  for (const c of [CORTES[0], CORTES[2], CORTES[4]]) {
    for (const tipo of ["C", "P"]) {
      const sub = base.filter((o) => c.f(o) && o.tipo === tipo);
      const a = mide(sub.filter((o) => regla.f(o))), l = mide(sub);
      console.log(`  | ${c.et} | ${tipo === "C" ? "calls" : "puts"} | ${num(a.n)} | **${R(a)}** | ${pct(acierto(a))} | ${R(l)} |`);
    }
  }
}

linea("RESUMEN DE LA LENTE 2");
console.log(`  PUERTAS ABIERTAS EN ESTA LENTE: no se busca ninguna regla nueva. Se examinan las 3 reglas que`);
console.log(`  ya venían del hallazgo, en 2 envases, con 6 cortes de tiempo, 11 años, 5 podas de tickers,`);
console.log(`  40 pruebas de dejar un ticker fuera, 11 de dejar un año fuera y 12 barajados. Nada de esto`);
console.log(`  elige nada: todo son pruebas de si lo ya elegido se cae.`);
for (const regla of REGLAS) {
  const r = RES[regla.id];
  console.log(`\n  ${regla.et}`);
  console.log(`    años por debajo de 1: ${r.anosA.malos} de ${r.anosA.conM} · gana a sus barajados en ${r.anosA.ganaBar} de ${r.anosA.conM} años`);
  console.log(`    tickers para la mitad del dinero: ${r.conA.tkS.cuantos} (sin señal ${r.conA.tkL.cuantos}) · operaciones para la mitad: ${r.conA.evS.cuantos} de ${num(r.barA.real.n)} (sin señal ${r.conA.evL.cuantos})`);
  console.log(`    ratio TODO ${R(r.barA.real)} · SIN 2020 ${R(r.barA.realS)} · peor jackknife de ticker ${r.conA.jkT[0].r.toFixed(2)} · peor jackknife de año ${r.conA.jkA[0].r.toFixed(2)}`);
}
console.log(`${"═".repeat(108)}\n`);
