// ══════════════════════════════════════════════════════════════════════════════════════════════
// LENTE 1-D — LOS CORTES DE ESTABILIDAD Y EL PUENTE
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// EN CRISTIANO
// Ya sabemos que no hay futuro colado y que no es el peaje. Quedan dos cosas por poner en numeros:
//   1. ¿De donde sale el dinero? Se quita 2020, se quita 2026 (que va a medias y aporta el dia mas
//      grande), y se quitan los dos a la vez.
//   2. EL PUENTE. Dentro de los montones de horquilla salio que la senal SOLO funciona cuando el
//      peaje es bajo: en los tres montones baratos da 1.65 / 1.94 / 1.74 y en los dos caros 0.79 y
//      1.22. La regla combinada — «ayer se movio mas del 2% Y la horquilla es menor del 7% de la
//      prima» — se examina entera: ano a ano, crisis, tickers, dias y barajado.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/z-lente1d-cortes.mjs
// ══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync, readdirSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CACHE_SPOT = "scripts/cache-theta/_y3-spots.json";
const APUESTA = 1000, ASKMIN = 0.10, TOLK = 0.50, SALIDA = 30;
const CALENT = 120, DESPL = 13;
const ENVASES = [{ id: "A", dist: 0.10, dte: 60 }, { id: "B", dist: 0.05, dte: 90 }];

const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const tolDte = (d) => Math.max(6, Math.round(d * 0.28));
const num = (n, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x) => (100 * x).toFixed(1) + "%";

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const TICKERS = [...diasPorSim.keys()].sort().filter((t) => diasPorSim.get(t).length >= 400);
const SPOT = JSON.parse(readFileSync(CACHE_SPOT, "utf8"));

const MED = {};
for (const sym of TICKERS) {
  const s = SPOT[sym], n = s.length;
  const r = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (!(s[i] > 0) || !(s[i - 1] > 0)) continue;
    let x = s[i] / s[i - 1] - 1;
    if (Math.abs(x) > 0.35) x = 0;
    r[i] = x;
  }
  const cum = new Array(n).fill(null); cum[0] = 1;
  for (let i = 1; i < n; i++) cum[i] = r[i] == null ? cum[i - 1] : cum[i - 1] * (1 + r[i]);
  const out = new Array(n).fill(null);
  for (let i = CALENT + 1; i < n; i++) {
    const w20 = cum.slice(i - 20, i), w120 = cum.slice(i - 120, i);
    const r20 = r.slice(i - 20, i).filter((x) => x != null);
    const r120 = r.slice(i - 120, i).filter((x) => x != null);
    if (w20.some((x) => !(x > 0)) || w120.some((x) => !(x > 0))) continue;
    if (r20.length < 18 || r120.length < 110) continue;
    let d2 = 0;
    for (let j = i - 1; j >= 1 && d2 < 250; j--) { if (r[j] == null || Math.abs(r[j]) > 0.02) break; d2++; }
    out[i] = { diasSin2: d2 };
  }
  MED[sym] = out;
}

const cacheCad = new Map(); const MAXC = 200;
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cacheCad.has(k)) { const v = cacheCad.get(k); cacheCad.delete(k); cacheCad.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); } catch { v = null; } }
  if (cacheCad.size >= MAXC) cacheCad.delete(cacheCad.keys().next().value);
  cacheCad.set(k, v); return v;
}

const filas = [];
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const vistos = new Set();
  for (let i = 0; i < dias.length; i++) {
    const dia = dias[i], mes = dia.slice(0, 6);
    if (vistos.has(mes)) continue;
    vistos.add(mes);
    const S = SPOT[sym][i]; if (!(S > 0)) continue;
    const m = MED[sym][i]; if (!m) continue;
    const c = cadena(sym, dia); if (!c) continue;
    for (const env of ENVASES) {
      let exp = null, md = Infinity;
      for (const e of Object.keys(c)) { const dt = dteDe(dia, e); if (dt < 1) continue; const x = Math.abs(dt - env.dte); if (x < md) { md = x; exp = e; } }
      if (!exp || md > tolDte(env.dte)) continue;
      const g = c[exp];
      for (const tipo of ["C", "P"]) {
        const objetivo = tipo === "C" ? S * (1 + env.dist) : S * (1 - env.dist);
        let mejor = null, dd = Infinity;
        for (const [clave, ba] of Object.entries(g)) {
          if (clave.slice(-1) !== tipo) continue;
          if (!(ba[1] >= ASKMIN)) continue;
          const K = Number(clave.slice(0, -2));
          const d = Math.abs(K - objetivo);
          if (d < dd) { dd = d; mejor = { K, clave, bid: ba[0], ask: ba[1] }; }
        }
        if (!mejor) continue;
        const distReal = tipo === "C" ? mejor.K / S - 1 : 1 - mejor.K / S;
        if (Math.abs(distReal - env.dist) > env.dist * TOLK) continue;
        let ds = dias[i + SALIDA] ?? null; if (!ds) continue;
        if (ds >= exp) ds = exp;
        const cs = cadena(sym, ds); if (!cs) continue;
        const grupo = cs[exp]; if (!grupo) continue;
        const salida = grupo[mejor.clave]?.[0] ?? 0;
        filas.push({
          env: env.id, sym, dia, ano: dia.slice(0, 4), tipo,
          ret: (salida - mejor.ask) / mejor.ask,
          horq: (mejor.ask - mejor.bid) / mejor.ask,
          senal: m.diasSin2 < 1,
        });
      }
    }
  }
  cacheCad.clear();
}

// barajado en el tiempo (13 entradas antes, mismo ticker) para la regla combinada
{
  const porTk = new Map();
  for (const f of filas) { if (!porTk.has(f.sym)) porTk.set(f.sym, []); porTk.get(f.sym).push(f); }
  for (const v of porTk.values()) {
    const dias = [...new Set(v.map((f) => f.dia))].sort();
    const sPorDia = new Map(); for (const f of v) sPorDia.set(f.dia, f.senal);
    const idx = new Map(dias.map((d, i) => [d, i]));
    for (const f of v) { const j = idx.get(f.dia) - DESPL; f.senalBaraj = j >= 0 ? sPorDia.get(dias[j]) : false; }
  }
}

const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
function suma(a, d) { a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; }
const ratio = (a) => (a.per > 0 ? a.gan / a.per : NaN);
const acierto = (a) => (a.n ? a.win / a.n : NaN);
const ganMed = (a) => (a.win ? a.gan / a.win : 0);
const perMed = (a) => (a.n - a.win ? a.per / (a.n - a.win) : 0);
function mide(pred, envId) { const a = acc(); for (const f of filas) if (f.env === envId && pred(f)) suma(a, APUESTA * f.ret); return a; }
const dol = (n) => "$" + num(Math.round(n));

console.log(`\n${"═".repeat(100)}`);
console.log("  LENTE 1-D — cortes de estabilidad y el puente");
console.log(`${"═".repeat(100)}`);

// ── 1) ¿de donde sale el dinero? ──────────────────────────────────────────────────────────────
console.log(`\n  1) LOS CORTES — «ayer se movio mas del 2%», envase A`);
const S = (f) => f.senal;
const cortes = [
  ["todo", () => true],
  ["sin febrero-mayo de 2020", (f) => !(f.dia >= "20200201" && f.dia <= "20200531")],
  ["sin 2026 (ano a medias)", (f) => f.ano !== "2026"],
  ["sin 2020 entero", (f) => f.ano !== "2020"],
  ["sin 2020 ni 2026", (f) => f.ano !== "2020" && f.ano !== "2026"],
  ["sin 2020, 2026 ni 2017", (f) => !["2020", "2026", "2017"].includes(f.ano)],
];
console.log(`  | corte | n senal | ratio senal | acierta | n liston | ratio liston |`);
console.log(`  |---|---|---|---|---|---|`);
for (const [et, p] of cortes) {
  const a = mide((f) => S(f) && p(f), "A"), b = mide(p, "A");
  console.log(`  | ${et} | ${num(a.n)} | **${ratio(a).toFixed(2)}** | ${pct(acierto(a))} | ${num(b.n)} | ${ratio(b).toFixed(2)} |`);
}

// ── 2) el puente: senal + peaje bajo ──────────────────────────────────────────────────────────
const ANOS = [...new Set(filas.map((f) => f.ano))].sort();
const PUENTE = (f) => f.senal && f.horq < 0.07;
console.log(`\n${"═".repeat(100)}`);
console.log("  2) EL PUENTE — «ayer se movio mas del 2%» Y «la horquilla es menor del 7% de la prima»");
console.log(`${"═".repeat(100)}`);
for (const env of ENVASES) {
  const t = mide(PUENTE, env.id);
  const b = mide(() => true, env.id);
  const bj = mide((f) => f.senalBaraj && f.horq < 0.07, env.id);
  console.log(`\n  ENVASE ${env.id}`);
  console.log(`  liston   : n=${num(b.n)} · ratio ${ratio(b).toFixed(2)} · acierta ${pct(acierto(b))}`);
  console.log(`  PUENTE   : n=${num(t.n)} · ratio ${ratio(t).toFixed(2)} · acierta ${pct(acierto(t))} · ganador ${dol(ganMed(t))} · perdedor ${dol(perMed(t))} · ${num(t.n / 11)} ops/ano`);
  console.log(`  barajado : n=${num(bj.n)} · ratio ${ratio(bj).toFixed(2)} · acierta ${pct(acierto(bj))}`);
  console.log(`  | ano | ${ANOS.join(" | ")} |`);
  console.log(`  | n | ${ANOS.map((a) => mide((f) => PUENTE(f) && f.ano === a, env.id).n).join(" | ")} |`);
  console.log(`  | ratio | ${ANOS.map((a) => { const y = mide((f) => PUENTE(f) && f.ano === a, env.id); return y.n >= 10 ? ratio(y).toFixed(2) : "n/d"; }).join(" | ")} |`);
  console.log(`  | acierta | ${ANOS.map((a) => { const y = mide((f) => PUENTE(f) && f.ano === a, env.id); return y.n >= 10 ? pct(acierto(y)) : "n/d"; }).join(" | ")} |`);
  const malos = ANOS.filter((a) => { const y = mide((f) => PUENTE(f) && f.ano === a, env.id); return y.n >= 20 && ratio(y) < 1; }).length;
  const conta = ANOS.filter((a) => mide((f) => PUENTE(f) && f.ano === a, env.id).n >= 20).length;
  console.log(`  anos por debajo de 1: ${malos} de ${conta} (con al menos 20 operaciones)`);
  for (const [et, p] of cortes.slice(1)) {
    const a = mide((f) => PUENTE(f) && p(f), env.id);
    console.log(`  ${et.padEnd(28)} ratio ${ratio(a).toFixed(2)} (n=${num(a.n)})`);
  }
  // tickers y dias
  const tks = new Map(), dias = new Map();
  for (const f of filas) {
    if (f.env !== env.id || !PUENTE(f)) continue;
    const d = APUESTA * f.ret;
    if (!tks.has(f.sym)) tks.set(f.sym, acc()); suma(tks.get(f.sym), d);
    if (!dias.has(f.dia)) dias.set(f.dia, acc()); suma(dias.get(f.dia), d);
  }
  for (const [et, mapa] of [["tickers", tks], ["dias", dias]]) {
    const lt = [...mapa.values()].sort((x, y) => y.gan - x.gan);
    let ac = 0, c = 0;
    for (const x of lt) { if (x.gan <= 0) break; ac += x.gan; c++; if (ac >= t.gan / 2) break; }
    console.log(`  ${c} ${et} de ${mapa.size} juntan la mitad de todo lo ganado`);
  }
}
console.log(`\n${"═".repeat(100)}\n`);
