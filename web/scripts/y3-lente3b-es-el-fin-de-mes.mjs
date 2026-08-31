// ══════════════════════════════════════════════════════════════════════════════════════════════
// LENTE 3 (segunda parte) — «¿ES "AYER SE MOVIÓ 2%" O ES "EL ÚLTIMO DÍA DEL MES SE MOVIÓ 2%"?»
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ EXISTE ESTE SCRIPT, EN CRISTIANO
// El hallazgo se enuncia así: «compra sólo si AYER el subyacente se movió más de un 2%». Suena a
// una regla que se puede aplicar cualquier día del año. PERO el envase que la midió entra SIEMPRE
// el PRIMER día de bolsa de cada mes (una entrada al mes por ticker, la primera que encuentra).
// Es decir: el «ayer» de la regla es SIEMPRE el ÚLTIMO día de bolsa del mes anterior, sin una
// sola excepción en las 1,357 operaciones.
//
// Y el último día del mes no es un día cualquiera: es cierre de mes (recolocación de carteras,
// maquillaje de escaparate), y en enero, abril, julio y octubre cae en plena temporada de
// resultados. Se nota: la regla dispara el 4.4% de las veces entrando el 1 de enero y el 31.0%
// entrando el 1 de febrero.
//
// Así que la regla NUNCA se ha probado otro día del mes. Aquí se prueba: se abren DOS puertas de
// entrada más — el día 11 y el día 21 de bolsa del mes — y se mide la MISMA regla en las tres.
//     · si funciona en las tres, el enunciado es correcto y además hay el TRIPLE de operaciones
//     · si sólo funciona en la primera, el hallazgo no es «ayer se movió 2%»: es un efecto de
//       fin de mes, y hay que decirlo con esas palabras
//
// ── LAS REGLAS DE LA CASA ─────────────────────────────────────────────────────────────────────
//  · SE COMPRA AL ASK Y SE VENDE AL BID, de la cadena en disco. Nunca punto medio.
//  · NINGÚN MODELO. Precio del subyacente por paridad put-call en el vencimiento MÁS CERCANO.
//  · UN HUECO NO ES UN CERO: si falta la cadena de salida o el vencimiento entero, se descarta y
//    se cuenta aparte. Si la cadena está y el contrato no aparece, vale 0 (dato real).
//  · SÓLO EL PASADO: la señal es el retorno del día anterior a la compra. Umbral FIJO del 2%,
//    sin percentiles ni ventanas que puedan mirar hacia delante.
//  · Las tres puertas de entrada se fijan por POSICIÓN dentro del mes (1ª, 11ª y 21ª sesión), no
//    eligiendo la que mejor salga.
//
// ⚠️ Al abrir tres puertas por mes las operaciones se SOLAPAN entre sí (se aguanta 30 sesiones).
//    Eso no invalida la comparación entre puertas —todas solapan igual— pero sí impide leer la
//    n como si fueran apuestas independientes. Queda dicho.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y3-lente3b-es-el-fin-de-mes.mjs
// ══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CACHE_SPOT = "scripts/cache-theta/_y3-spots.json";
const CACHE = "scripts/cache-theta/_y3l3b-filas.json";

const APUESTA = 1000;
const ASKMIN = 0.10;
const TOLK = 0.50;
const SALIDA = 30;
const MIN_DIAS_TICKER = 400;
const CALENT = 120;
const PUERTAS = [0, 10, 20];   // 1ª, 11ª y 21ª sesión del mes — fijas, no elegidas

const ENVASES = [
  { id: "A", dist: 0.10, dte: 60, et: "10% fuera · 60 días · salir a los 30 de bolsa" },
  { id: "B", dist: 0.05, dte: 90, et: " 5% fuera · 90 días · salir a los 30 de bolsa" },
];

const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const tolDte = (d) => Math.max(6, Math.round(d * 0.28));
const num = (n, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x) => (100 * x).toFixed(1) + "%";
const dol = (n) => "$" + num(Math.round(n));

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

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const TICKERS = [...diasPorSim.keys()].sort().filter((t) => diasPorSim.get(t).length >= MIN_DIAS_TICKER);

console.log(`\n${"═".repeat(102)}`);
console.log("  ¿ES «AYER SE MOVIÓ 2%» O ES «EL ÚLTIMO DÍA DEL MES SE MOVIÓ 2%»?");
console.log(`${"═".repeat(102)}`);
console.log(`  ${TICKERS.length} tickers · tres puertas de entrada al mes (1ª, 11ª y 21ª sesión), fijadas de antemano`);

let SPOT = JSON.parse(readFileSync(CACHE_SPOT, "utf8"));
if (!TICKERS.every((t) => SPOT[t])) throw new Error("la caché de precios no cubre todos los tickers");

// retornos con el split neutralizado el propio día (idéntico al original)
const RET = {};
for (const sym of TICKERS) {
  const s = SPOT[sym], n = s.length, r = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (!(s[i] > 0) || !(s[i - 1] > 0)) continue;
    let x = s[i] / s[i - 1] - 1;
    if (Math.abs(x) > 0.35) x = 0;
    r[i] = x;
  }
  RET[sym] = r;
}

const cacheCad = new Map();
const MAXC = 200;
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cacheCad.has(k)) { const v = cacheCad.get(k); cacheCad.delete(k); cacheCad.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); } catch { v = null; } }
  if (cacheCad.size >= MAXC) cacheCad.delete(cacheCad.keys().next().value);
  cacheCad.set(k, v);
  return v;
}

let filas = null, san = null;
if (existsSync(CACHE)) { try { const o = JSON.parse(readFileSync(CACHE, "utf8")); filas = o.filas; san = o.san; } catch { filas = null; } }

if (!filas) {
  filas = [];
  san = { A: { n: 0, huecos: 0, sinContrato: 0, sinValor: 0, coste: 0, horq: 0 }, B: { n: 0, huecos: 0, sinContrato: 0, sinValor: 0, coste: 0, horq: 0 } };
  let entradas = 0, sinRetAyer = 0;
  for (const sym of TICKERS) {
    const dias = diasPorSim.get(sym), r = RET[sym];
    // índices de las sesiones de cada mes
    const porMes = new Map();
    for (let i = 0; i < dias.length; i++) {
      const m = dias[i].slice(0, 6);
      if (!porMes.has(m)) porMes.set(m, []);
      porMes.get(m).push(i);
    }
    for (const [, idxs] of porMes) {
      for (let p = 0; p < PUERTAS.length; p++) {
        const i = idxs[PUERTAS[p]];
        if (i == null) continue;
        if (i < CALENT + 1) continue;
        const S = SPOT[sym][i];
        if (!(S > 0)) continue;
        const rAyer = r[i - 1];
        if (rAyer == null) { sinRetAyer++; continue; }   // HUECO: no se puede saber si ayer hubo jaleo
        entradas++;
        const c = cadena(sym, dias[i]);
        if (!c) continue;
        for (const env of ENVASES) {
          let exp = null, md = Infinity;
          for (const e of Object.keys(c)) { const dt = dteDe(dias[i], e); if (dt < 1) continue; const x = Math.abs(dt - env.dte); if (x < md) { md = x; exp = e; } }
          if (!exp || md > tolDte(env.dte)) { san[env.id].sinContrato += 2; continue; }
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
            if (!mejor) { san[env.id].sinContrato++; continue; }
            const distReal = tipo === "C" ? mejor.K / S - 1 : 1 - mejor.K / S;
            if (Math.abs(distReal - env.dist) > env.dist * TOLK) { san[env.id].sinContrato++; continue; }
            let ds = dias[i + SALIDA] ?? null;
            if (!ds) { san[env.id].huecos++; continue; }
            if (ds >= exp) ds = exp;
            const cs = cadena(sym, ds);
            if (!cs) { san[env.id].huecos++; continue; }
            const grupo = cs[exp];
            if (!grupo) { san[env.id].huecos++; continue; }
            const salida = grupo[mejor.clave]?.[0] ?? 0;
            const s2 = san[env.id];
            s2.n++; s2.coste += mejor.ask / S; s2.horq += (mejor.ask - mejor.bid) / mejor.ask;
            if (salida === 0) s2.sinValor++;
            filas.push({
              env: env.id, sym, dia: dias[i], ano: dias[i].slice(0, 4), puerta: p, tipo,
              ret: (salida - mejor.ask) / mejor.ask, ask: mejor.ask, movAyer: Math.abs(rAyer),
            });
          }
        }
      }
    }
    cacheCad.clear();
    process.stderr.write(`\r   ${sym} · ${num(entradas)} entradas · ${num(filas.length)} operaciones      `);
  }
  process.stderr.write("\n");
  console.log(`  entradas descartadas por no tener el retorno de ayer (hueco): ${num(sinRetAyer)}`);
  writeFileSync(CACHE, JSON.stringify({ filas, san }));
}

// ── medición ──────────────────────────────────────────────────────────────────────────────────
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
const suma = (a, d) => { a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; };
const ratio = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const acierto = (a) => (a.n ? a.win / a.n : NaN);
const ganMedio = (a) => (a.win ? a.gan / a.win : 0);
const perMedio = (a) => (a.n - a.win ? a.per / (a.n - a.win) : 0);
const rr = (a) => (a.n ? ratio(a).toFixed(2) : "n/d");
const mide = (fs) => { const a = acc(); for (const f of fs) suma(a, APUESTA * f.ret); return a; };
const SENAL = (f) => f.movAyer > 0.02;

console.log(`\n${"═".repeat(102)}`);
console.log("  SANIDAD");
console.log(`${"═".repeat(102)}`);
for (const env of ENVASES) {
  const s = san[env.id];
  console.log(`  ENVASE ${env.id} — ${env.et}`);
  console.log(`    operaciones ${num(s.n)} · huecos descartados ${num(s.huecos)} (${pct(s.huecos / (s.huecos + s.n))}) · sin contrato que encaje ${num(s.sinContrato)}`);
  console.log(`    coste medio de entrada ${pct(s.coste / s.n)} del subyacente · horquilla media ${pct(s.horq / s.n)} de la prima · vencen sin valor ${pct(s.sinValor / s.n)}`);
}

const NOM = ["1ª sesión del mes (LA DEL HALLAZGO)", "11ª sesión del mes (NUEVA)", "21ª sesión del mes (NUEVA)"];
for (const env of ENVASES) {
  const F = filas.filter((f) => f.env === env.id);
  console.log(`\n${"═".repeat(102)}`);
  console.log(`  ENVASE ${env.id} — ${env.et}`);
  console.log(`${"═".repeat(102)}`);
  console.log(`  | puerta de entrada | n | ratio SIN regla | acierta | n CON regla | ratio CON regla | acierta | dispara | ops/año |`);
  console.log(`  |---|---|---|---|---|---|---|---|---|`);
  for (let p = 0; p < 3; p++) {
    const t = F.filter((f) => f.puerta === p);
    const b = mide(t), c = mide(t.filter(SENAL));
    console.log(`  | ${NOM[p]} | ${num(b.n)} | ${rr(b)} | ${pct(acierto(b))} | ${num(c.n)} | **${rr(c)}** | ${pct(acierto(c))} | ${pct(c.n / b.n)} | ${num(c.n / 11)} |`);
  }
  const b = mide(F), c = mide(F.filter(SENAL));
  console.log(`  | LAS TRES JUNTAS | ${num(b.n)} | ${rr(b)} | ${pct(acierto(b))} | ${num(c.n)} | **${rr(c)}** | ${pct(acierto(c))} | ${pct(c.n / b.n)} | ${num(c.n / 11)} |`);
  const d = mide(F.filter((f) => f.puerta > 0)), dc = mide(F.filter((f) => f.puerta > 0 && SENAL(f)));
  console.log(`  | las dos NUEVAS (fuera de fin de mes) | ${num(d.n)} | ${rr(d)} | ${pct(acierto(d))} | ${num(dc.n)} | **${rr(dc)}** | ${pct(acierto(dc))} | ${pct(dc.n / d.n)} | ${num(dc.n / 11)} |`);
  console.log(`\n  ganador/perdedor medio con la regla en las tres juntas: ${dol(ganMedio(c))} / ${dol(perMedio(c))}`);
}

// año a año de las tres puertas juntas (envase A)
{
  const F = filas.filter((f) => f.env === "A");
  const ANOS = [...new Set(F.map((f) => f.ano))].sort();
  console.log(`\n${"═".repeat(102)}`);
  console.log("  AÑO A AÑO — envase A, la regla del 2% con las TRES puertas de entrada");
  console.log(`${"═".repeat(102)}`);
  console.log(`  | año | ${ANOS.join(" | ")} |`);
  console.log(`  |---|${ANOS.map(() => "---").join("|")}|`);
  const con = ANOS.map((a) => mide(F.filter((f) => f.ano === a && SENAL(f))));
  const sin = ANOS.map((a) => mide(F.filter((f) => f.ano === a)));
  console.log(`  | n con regla | ${con.map((x) => num(x.n)).join(" | ")} |`);
  console.log(`  | ratio CON regla | ${con.map((x) => rr(x)).join(" | ")} |`);
  console.log(`  | acierta | ${con.map((x) => pct(acierto(x))).join(" | ")} |`);
  console.log(`  | ratio SIN regla | ${sin.map((x) => rr(x)).join(" | ")} |`);
  const malos = con.filter((x) => x.n >= 20 && ratio(x) < 1).length;
  console.log(`  años por debajo de 1 (con al menos 20 operaciones): ${malos} de ${con.filter((x) => x.n >= 20).length}`);
  const mit1 = mide(F.filter((f) => Number(f.ano) <= 2020 && SENAL(f)));
  const mit2 = mide(F.filter((f) => Number(f.ano) > 2020 && SENAL(f)));
  console.log(`  mitades: 2016-2020 ${rr(mit1)} (n=${num(mit1.n)}) · 2021-2026 ${rr(mit2)} (n=${num(mit2.n)})`);
  const sin20 = mide(F.filter((f) => SENAL(f) && !(f.dia >= "20200201" && f.dia <= "20200531")));
  console.log(`  quitando febrero-mayo de 2020: ${rr(sin20)} (n=${num(sin20.n)})`);
  const tks = new Map();
  for (const f of F.filter(SENAL)) { if (!tks.has(f.sym)) tks.set(f.sym, acc()); suma(tks.get(f.sym), APUESTA * f.ret); }
  const tot = mide(F.filter(SENAL));
  const lt = [...tks.entries()].map(([k, v]) => ({ k, v })).sort((a, b) => b.v.gan - a.v.gan);
  let ac = 0, cuantos = 0;
  for (const t of lt) { if (t.v.gan <= 0) break; ac += t.v.gan; cuantos++; if (ac >= tot.gan / 2) break; }
  console.log(`  tickers que juntan la mitad del dinero ganado: ${cuantos} de ${lt.length} · con ratio > 1: ${lt.filter((t) => ratio(t.v) > 1).length}`);
  console.log(`  calls: ${rr(mide(F.filter((f) => SENAL(f) && f.tipo === "C")))} · puts: ${rr(mide(F.filter((f) => SENAL(f) && f.tipo === "P")))}`);
}

// ── el barajado, 20 veces, sobre las tres puertas ─────────────────────────────────────────────
console.log(`\n${"═".repeat(102)}`);
console.log("  EL BARAJADO, 20 VECES, sobre las tres puertas — señal de k entradas antes del mismo ticker");
console.log(`${"═".repeat(102)}`);
{
  const F = filas.filter((f) => f.env === "A");
  const porTk = new Map();
  for (const f of F) { if (!porTk.has(f.sym)) porTk.set(f.sym, new Map()); porTk.get(f.sym).set(f.dia, f); }
  const diasTk = new Map(), idxTk = new Map();
  for (const [sym, m] of porTk) { const ds = [...m.keys()].sort(); diasTk.set(sym, ds); idxTk.set(sym, new Map(ds.map((d, i) => [d, i]))); }
  const res = [];
  for (let k = 1; k <= 20; k++) {
    const sel = [];
    for (const f of F) {
      const ds = diasTk.get(f.sym);
      const j = idxTk.get(f.sym).get(f.dia) - k;
      if (j < 0) continue;
      const otra = porTk.get(f.sym).get(ds[j]);
      if (otra && SENAL(otra)) sel.push(f);
    }
    res.push(mide(sel));
  }
  const real = mide(F.filter(SENAL));
  console.log(`  | desplazamiento | ${res.map((_, i) => i + 1).join(" | ")} |`);
  console.log(`  |---|${res.map(() => "---").join("|")}|`);
  console.log(`  | ratio | ${res.map((x) => ratio(x).toFixed(2)).join(" | ")} |`);
  const rs = res.map((x) => ratio(x)).sort((a, b) => a - b);
  const as = res.map((x) => acierto(x)).sort((a, b) => a - b);
  console.log(`\n  nube de los 20: mínimo ${rs[0].toFixed(2)} · mediana ${rs[10].toFixed(2)} · máximo ${rs[19].toFixed(2)}   ·  la señal de verdad ${ratio(real).toFixed(2)}`);
  console.log(`  barajados que igualan o pasan a la señal: ${rs.filter((x) => x >= ratio(real)).length} de 20 · que llegan a 1.40: ${rs.filter((x) => x >= 1.40).length} de 20`);
  console.log(`  acierto barajado: mínimo ${pct(as[0])} · mediana ${pct(as[10])} · máximo ${pct(as[19])}  ·  el de verdad ${pct(acierto(real))}`);
}

console.log(`\n${"═".repeat(102)}`);
console.log("  PUERTAS ABIERTAS: 3 (fijadas de antemano: 1ª, 11ª y 21ª sesión del mes) × 1 regla × 2 envases.");
console.log("  No se ha barrido ningún umbral aquí: el 2% viene dado del hallazgo que se audita.");
console.log(`${"═".repeat(102)}\n`);
