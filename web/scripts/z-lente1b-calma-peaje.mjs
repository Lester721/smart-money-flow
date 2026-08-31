// ══════════════════════════════════════════════════════════════════════════════════════════════
// LENTE 1-B — ¿LA SENAL PREDICE, O SOLO PAGA MENOS PEAJE?
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// EN CRISTIANO
// La auditoria de la ventana salio limpia: no hay futuro colado. Pero al mirar el precio de entrada
// aparecio algo: cuando la senal dispara, la opcion cuesta el 2.3% del subyacente en vez del 1.2%,
// y la horquilla baja del 10.7% al 8.4% de la prima. O sea: la senal no solo elige un MOMENTO,
// elige una OPCION MAS CARA Y MAS LIQUIDA. Y este proyecto ya sabe que la horquilla es un
// porcentaje de la prima: prima gorda = peaje pequeno.
//
// Este fichero pregunta: si comparo la senal contra dias SIN senal que pagan el MISMO peaje,
// ¿sigue ganando? Si no, lo que hay no es una prediccion, es un descuento de peaje.
//
// Y de paso:
//   · el recorte justo de los dias grandes (a la senal Y al liston, para no castigar la convexidad)
//   · el conteo de DIAS ganadores, no de contratos
//   · la alternativa directa: comprar cuando la horquilla es baja, sin mirar el movimiento de ayer
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/z-lente1b-calma-peaje.mjs
// ══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync, readdirSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CACHE_SPOT = "scripts/cache-theta/_y3-spots.json";
const APUESTA = 1000, ASKMIN = 0.10, TOLK = 0.50, SALIDA = 30;
const MIN_DIAS_TICKER = 400, CALENT = 120;
const ENVASES = [
  { id: "A", dist: 0.10, dte: 60 },
  { id: "B", dist: 0.05, dte: 90 },
];

const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const tolDte = (d) => Math.max(6, Math.round(d * 0.28));
const num = (n, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x) => (100 * x).toFixed(1) + "%";
const dol = (n) => "$" + num(Math.round(n));

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const TICKERS = [...diasPorSim.keys()].sort().filter((t) => diasPorSim.get(t).length >= MIN_DIAS_TICKER);
const SPOT = JSON.parse(readFileSync(CACHE_SPOT, "utf8"));

// ── medidas (copia literal) ───────────────────────────────────────────────────────────────────
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
          costeRel: mejor.ask / S, horq: (mejor.ask - mejor.bid) / mejor.ask,
          senal: m.diasSin2 < 1,
        });
      }
    }
  }
  cacheCad.clear();
}

const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
function suma(a, d) { a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; }
const ratio = (a) => (a.per > 0 ? a.gan / a.per : NaN);
const acierto = (a) => (a.n ? a.win / a.n : NaN);
function mide(pred, envId) { const a = acc(); for (const f of filas) if (f.env === envId && pred(f)) suma(a, APUESTA * f.ret); return a; }
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

console.log(`\n${"═".repeat(100)}`);
console.log("  LENTE 1-B — ¿la senal predice, o solo paga menos peaje?");
console.log(`${"═".repeat(100)}`);
console.log(`  ${num(filas.length)} operaciones · ${TICKERS.length} tickers`);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1) EL RECORTE DE LOS DIAS GRANDES, APLICADO A LAS DOS (justo con la convexidad)
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}`);
console.log("  1) QUITAR LOS DIAS QUE MAS APORTAN — a la senal Y al liston, para no castigar la cola");
console.log(`${"═".repeat(100)}`);
function recorte(envId, pred, et) {
  const porDia = new Map();
  for (const f of filas) { if (f.env !== envId || !pred(f)) continue; if (!porDia.has(f.dia)) porDia.set(f.dia, acc()); suma(porDia.get(f.dia), APUESTA * f.ret); }
  const tot = mide(pred, envId);
  const lista = [...porDia.entries()].map(([d, a]) => ({ d, a })).sort((x, y) => y.a.gan - x.a.gan);
  const sal = [];
  for (const k of [0, 1, 3, 5, 10]) {
    const g = tot.gan - lista.slice(0, k).reduce((s, x) => s + x.a.gan, 0);
    const p = tot.per - lista.slice(0, k).reduce((s, x) => s + x.a.per, 0);
    sal.push(`quitando ${String(k).padStart(2)} dias: ${(g / p).toFixed(2)}`);
  }
  console.log(`  ${et.padEnd(30)} n=${String(num(tot.n)).padStart(6)} · ${porDia.size} dias · ${sal.join(" · ")}`);
}
for (const env of ENVASES) {
  recorte(env.id, (f) => f.senal, `${env.id} · CON senal`);
  recorte(env.id, () => true, `${env.id} · liston (todo)`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2) DIAS GANADORES, NO CONTRATOS — en cada dia se abren ~12 contratos correlacionados
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}`);
console.log("  2) LA MUESTRA DE VERDAD — un dia de compra es UNA apuesta, no doce");
console.log(`${"═".repeat(100)}`);
for (const env of ENVASES) {
  for (const [et, pred] of [["CON senal", (f) => f.senal], ["liston", () => true]]) {
    const porDia = new Map();
    for (const f of filas) { if (f.env !== env.id || !pred(f)) continue; if (!porDia.has(f.dia)) porDia.set(f.dia, acc()); suma(porDia.get(f.dia), APUESTA * f.ret); }
    const netos = [...porDia.values()].map((a) => a.gan - a.per);
    const gana = netos.filter((x) => x > 0).length;
    console.log(`  ${env.id} · ${et.padEnd(10)} ${porDia.size} dias de compra · ${gana} terminan en verde (${pct(gana / porDia.size)}) · mediana del dia ${dol(pctl(netos, 0.5))}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3) EL CONTROL DEL PEAJE — misma horquilla, ¿sigue ganando la senal?
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}`);
console.log("  3) A IGUALDAD DE PEAJE — se parten las operaciones en 5 monteones por HORQUILLA");
console.log("     (la horquilla se ve en pantalla al comprar, asi que cortar por ella es legitimo)");
console.log(`${"═".repeat(100)}`);
for (const env of ENVASES) {
  const v = filas.filter((f) => f.env === env.id);
  const cortes = [0.2, 0.4, 0.6, 0.8].map((q) => pctl(v.map((f) => f.horq), q));
  const cubo = (f) => { let k = 0; for (const c of cortes) if (f.horq > c) k++; return k; };
  console.log(`\n  ENVASE ${env.id} — cortes de horquilla: ${cortes.map((c) => pct(c)).join(" · ")}`);
  console.log(`  | monton de horquilla | n CON senal | ratio CON | acierta CON | n SIN | ratio SIN | acierta SIN |`);
  console.log(`  |---|---|---|---|---|---|---|`);
  for (let k = 0; k < 5; k++) {
    const s = mide((f) => cubo(f) === k && f.senal, env.id);
    const o = mide((f) => cubo(f) === k && !f.senal, env.id);
    console.log(`  | ${k + 1}${k === 0 ? " (peaje mas bajo)" : k === 4 ? " (peaje mas alto)" : ""} | ${num(s.n)} | ${ratio(s).toFixed(2)} | ${pct(acierto(s))} | ${num(o.n)} | ${ratio(o).toFixed(2)} | ${pct(acierto(o))} |`);
  }
  // el mismo control, pero por COSTE (prima / subyacente)
  const cortesC = [0.2, 0.4, 0.6, 0.8].map((q) => pctl(v.map((f) => f.costeRel), q));
  const cuboC = (f) => { let k = 0; for (const c of cortesC) if (f.costeRel > c) k++; return k; };
  console.log(`\n  ENVASE ${env.id} — cortes de COSTE (prima/subyacente): ${cortesC.map((c) => pct(c)).join(" · ")}`);
  console.log(`  | monton de coste | n CON senal | ratio CON | n SIN | ratio SIN |`);
  console.log(`  |---|---|---|---|---|`);
  for (let k = 0; k < 5; k++) {
    const s = mide((f) => cuboC(f) === k && f.senal, env.id);
    const o = mide((f) => cuboC(f) === k && !f.senal, env.id);
    console.log(`  | ${k + 1}${k === 0 ? " (mas barata)" : k === 4 ? " (mas cara)" : ""} | ${num(s.n)} | ${ratio(s).toFixed(2)} | ${num(o.n)} | ${ratio(o).toFixed(2)} |`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4) LA ALTERNATIVA DIRECTA — comprar por PEAJE BAJO, sin mirar el movimiento de ayer
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}`);
console.log("  4) LA ALTERNATIVA — «compra solo si la horquilla es menor que X% de la prima»");
console.log("     Umbral FIJO, se ve en pantalla, no mira ninguna historia. Y dispara mucho mas.");
console.log(`${"═".repeat(100)}`);
const ANOSPAN = 11;
for (const env of ENVASES) {
  console.log(`\n  ENVASE ${env.id}`);
  console.log(`  | umbral de horquilla | n | ratio | acierta | ops/ano | + la senal de ayer: n | ratio |`);
  console.log(`  |---|---|---|---|---|---|---|`);
  for (const X of [0.03, 0.05, 0.07, 0.10, 0.15]) {
    const a = mide((f) => f.horq < X, env.id);
    const b = mide((f) => f.horq < X && f.senal, env.id);
    console.log(`  | menos del ${pct(X)} | ${num(a.n)} | **${ratio(a).toFixed(2)}** | ${pct(acierto(a))} | ${num(a.n / ANOSPAN)} | ${num(b.n)} | ${ratio(b).toFixed(2)} |`);
  }
}
// ano a ano de la mejor alternativa en A
{
  const ANOS = [...new Set(filas.map((f) => f.ano))].sort();
  for (const X of [0.05, 0.07]) {
    const t = mide((f) => f.horq < X, "A");
    console.log(`\n  A · horquilla < ${pct(X)} : ratio ${ratio(t).toFixed(2)} · acierta ${pct(acierto(t))} · n=${num(t.n)} · ${num(t.n / ANOSPAN)} ops/ano`);
    console.log(`  | ano | ${ANOS.join(" | ")} |`);
    console.log(`  | n | ${ANOS.map((a) => mide((f) => f.horq < X && f.ano === a, "A").n).join(" | ")} |`);
    console.log(`  | ratio | ${ANOS.map((a) => { const y = mide((f) => f.horq < X && f.ano === a, "A"); return y.n >= 10 ? ratio(y).toFixed(2) : "n/d"; }).join(" | ")} |`);
    const s20 = mide((f) => f.horq < X && !(f.dia >= "20200201" && f.dia <= "20200531"), "A");
    console.log(`  sin febrero-mayo de 2020: ${ratio(s20).toFixed(2)} (n=${num(s20.n)})`);
  }
}
console.log(`\n${"═".repeat(100)}\n`);
