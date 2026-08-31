// ══════════════════════════════════════════════════════════════════════════════════════════════
// LENTE 2 — ¿«el ruido de ayer» es de verdad, o sólo es 2020 y cuatro tickers?
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ SE AUDITA
// El hallazgo dice: compra la opción suelta SÓLO si AYER el subyacente se movió más del 2%.
// Envase A (10% fuera · 60 días · vender a los 30 de bolsa) da ratio 1.51 contra 1.11 sin regla.
// Aquí se le quitan trozos a la muestra para ver si el 1.51 vive de un año o de un puñado de
// nombres, y se separa eso de la concentración NORMAL de una estrategia convexa (que unos pocos
// EVENTOS paguen la cuenta es el diseño; que un TICKER o un AÑO la sostengan, no).
//
// SE REPRODUCE LA TUBERÍA ENTERA del script original (mismo envase, mismos precios, mismos
// huecos) y encima se corren SIETE pruebas:
//   1. quitar febrero-mayo de 2020 · quitar 2020 ENTERO · quitar 2020 y 2026 (año incompleto)
//   2. año a año, con regla y sin regla, y la mejora de cada año
//   3. dejar fuera un año cada vez (los 11) y quedarse con el PEOR
//   4. concentración por ticker — y la MISMA cuenta sin regla, que es el punto de comparación
//   5. dejar fuera un ticker cada vez, y quitar los tres que más aportan
//   6. concentración por EVENTO (los mayores billetes), otra vez comparada contra el sin-regla
//   7. la prueba cruzada: sin 2020 Y sin los tres mejores tickers a la vez
//
// Y TRES COMPROBACIONES DE FONTANERÍA que pueden matar el hallazgo por sí solas:
//   A. ¿el «ayer» es de verdad ayer? Los días vienen de los ficheros de cadena, que tienen
//      huecos. Si entre dos ficheros pasaron 4 días, el «movimiento de ayer» es en realidad el de
//      cuatro días y supera el 2% mucho más fácil. Se mide el hueco en días de calendario.
//   B. ¿un precio que FALTA se está leyendo como señal? En el original, si el retorno de ayer es
//      null el bucle rompe con cero días de calma, o sea que dispara la compra. Se cuenta.
//   C. ¿la señal sobrevive si se calcula con los CIERRES REALES de disco en vez de con el precio
//      deducido de la paridad? Los cierres reales cubren 2021-2026. Réplica independiente.
//
// Y el barajado con DOCE desplazamientos distintos en vez de uno solo (una sola tirada ya retiró
// un hallazgo de este proyecto).
//
// REGLAS DE LA CASA: se compra al ASK y se vende al BID · ningún modelo de precios · un hueco se
// descarta y se cuenta aparte (bid 0 con la cadena presente SÍ es un dato real) · la señal sólo
// mira días anteriores al de la compra.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/L2-calma-lente-2.mjs
// ══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const CACHE_SPOT = "scripts/cache-theta/_y3-spots.json";
const CACHE_FILAS = "scripts/cache-theta/_L2-filas.json";

const APUESTA = 1000;
const ASKMIN = 0.10;
const TOLK = 0.50;
const SALIDA = 30;
const MIN_DIAS_TICKER = 400;
const CALENT = 120;
const UMBRAL = 0.02;      // el movimiento de ayer que dispara la compra

const ENVASES = [
  { id: "A", dist: 0.10, dte: 60, et: "10% fuera · 60 días · salir a los 30 de bolsa" },
  { id: "B", dist: 0.05, dte: 90, et: " 5% fuera · 90 días · salir a los 30 de bolsa" },
];

const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const tolDte = (d) => Math.max(6, Math.round(d * 0.28));
const num = (n, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/d");
const dol = (n) => "$" + num(Math.round(n));
const r2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "n/d");

// ── índice de días por ticker ──────────────────────────────────────────────────────────────────
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
for (const t of TICKERS) if (!SPOT[t]) throw new Error(`falta el precio de ${t} en la caché`);

console.log(`\n${"═".repeat(104)}`);
console.log("  LENTE 2 — ¿ES SÓLO 2020, O SÓLO UNOS POCOS TICKERS?   regla: «ayer se movió más del 2%»");
console.log(`${"═".repeat(104)}`);
console.log(`  ${TICKERS.length} tickers · precio deducido de la paridad put-call del vencimiento MÁS CERCANO`);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// FONTANERÍA A — ¿los días de la cadena son consecutivos? El «ayer» depende de eso
// ══════════════════════════════════════════════════════════════════════════════════════════════
{
  console.log(`\n${"─".repeat(104)}`);
  console.log("  FONTANERÍA A — cobertura de la cadena: si faltan días, el «movimiento de ayer» es de varios días");
  console.log(`${"─".repeat(104)}`);
  console.log(`  | ticker | días de cadena | del | al | huecos de más de 4 días naturales entre ficheros consecutivos |`);
  console.log(`  |---|---|---|---|---|`);
  let peor = [];
  for (const t of TICKERS) {
    const d = diasPorSim.get(t);
    let saltos = 0;
    for (let i = 1; i < d.length; i++) if (dteDe(d[i - 1], d[i]) > 4) saltos++;
    peor.push({ t, n: d.length, a: d[0], b: d[d.length - 1], saltos });
  }
  peor.sort((a, b) => b.saltos - a.saltos);
  for (const p of peor.slice(0, 6)) console.log(`  | ${p.t} | ${num(p.n)} | ${p.a} | ${p.b} | ${p.saltos} |`);
  console.log(`  (los 6 peores de ${TICKERS.length}; el resto tiene menos)`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LAS MEDIDAS — idénticas al original: retorno de ayer, splits neutralizados el propio día
// ══════════════════════════════════════════════════════════════════════════════════════════════
const RET = {};      // ticker -> retorno diario (o null)
const SEN = {};      // ticker -> {sen, senNull, gapAyer}
let nullComoSenal = 0, senalTotalDias = 0;
for (const sym of TICKERS) {
  const s = SPOT[sym], n = s.length, dias = diasPorSim.get(sym);
  const r = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (!(s[i] > 0) || !(s[i - 1] > 0)) continue;
    let x = s[i] / s[i - 1] - 1;
    if (Math.abs(x) > 0.35) x = 0;      // parece un split: se neutraliza EL PROPIO DÍA
    r[i] = x;
  }
  RET[sym] = r;
  const out = new Array(n).fill(null);
  for (let i = CALENT + 1; i < n; i++) {
    const ay = r[i - 1];
    // el original rompe el bucle también cuando el retorno es null → cuenta como señal. Se marca.
    const esNull = ay == null;
    const disp = esNull || Math.abs(ay) > UMBRAL;
    if (disp) senalTotalDias++;
    if (esNull) nullComoSenal++;
    out[i] = {
      sen: disp,
      senLimpia: !esNull && Math.abs(ay) > UMBRAL,    // sin contar los huecos como señal
      esNull,
      movAyer: esNull ? null : Math.abs(ay),
      gapAyer: i >= 2 ? dteDe(dias[i - 2], dias[i - 1]) : null,
    };
  }
  SEN[sym] = out;
}
console.log(`\n  FONTANERÍA B — días en los que el retorno de ayer FALTA y el original lo lee como señal: ${num(nullComoSenal)} de ${num(senalTotalDias)} disparos (${pct(nullComoSenal / senalTotalDias)})`);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LAS OPERACIONES — misma tubería que el original
// ══════════════════════════════════════════════════════════════════════════════════════════════
let filas = null;
if (existsSync(CACHE_FILAS)) { try { filas = JSON.parse(readFileSync(CACHE_FILAS, "utf8")); } catch { filas = null; } }

if (!filas) {
  filas = [];
  const cacheCad = new Map(), MAXC = 200;
  function cadena(sym, dia) {
    const k = `${sym}|${dia}`;
    if (cacheCad.has(k)) return cacheCad.get(k);
    const f = `${CDIR}/${sym}_d${dia}.json`;
    let v = null;
    if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); } catch { v = null; } }
    if (cacheCad.size >= MAXC) cacheCad.delete(cacheCad.keys().next().value);
    cacheCad.set(k, v);
    return v;
  }
  const san = { A: { n: 0, huecos: 0, sinContrato: 0, coste: 0, horq: 0, sinValor: 0, trunc: 0 },
                B: { n: 0, huecos: 0, sinContrato: 0, coste: 0, horq: 0, sinValor: 0, trunc: 0 } };
  let entradas = 0;
  for (const sym of TICKERS) {
    const dias = diasPorSim.get(sym), vistos = new Set();
    for (let i = 0; i < dias.length; i++) {
      const dia = dias[i], mes = dia.slice(0, 6);
      if (vistos.has(mes)) continue;
      vistos.add(mes);
      const S = SPOT[sym][i]; if (!(S > 0)) continue;
      const sg = SEN[sym][i]; if (!sg) continue;
      entradas++;
      const c = cadena(sym, dia); if (!c) continue;
      for (const env of ENVASES) {
        let exp = null, md = Infinity;
        for (const e of Object.keys(c)) { const dt = dteDe(dia, e); if (dt < 1) continue; const x = Math.abs(dt - env.dte); if (x < md) { md = x; exp = e; } }
        if (!exp || md > tolDte(env.dte)) { san[env.id].sinContrato += 2; continue; }
        const g = c[exp];
        for (const tipo of ["C", "P"]) {
          const objetivo = tipo === "C" ? S * (1 + env.dist) : S * (1 - env.dist);
          let mejor = null, dd = Infinity;
          for (const [clave, ba] of Object.entries(g)) {
            if (clave.slice(-1) !== tipo) continue;
            if (!(ba[1] >= ASKMIN)) continue;
            const K = Number(clave.slice(0, -2)); const d = Math.abs(K - objetivo);
            if (d < dd) { dd = d; mejor = { K, clave, bid: ba[0], ask: ba[1] }; }
          }
          if (!mejor) { san[env.id].sinContrato++; continue; }
          const distReal = tipo === "C" ? mejor.K / S - 1 : 1 - mejor.K / S;
          if (Math.abs(distReal - env.dist) > env.dist * TOLK) { san[env.id].sinContrato++; continue; }
          let ds = dias[i + SALIDA] ?? null, trunc = 0;
          if (!ds) { san[env.id].huecos++; continue; }
          if (ds >= exp) { ds = exp; trunc = 1; }
          const cs = cadena(sym, ds); if (!cs) { san[env.id].huecos++; continue; }
          const grupo = cs[exp]; if (!grupo) { san[env.id].huecos++; continue; }   // HUECO, no cero
          const salida = grupo[mejor.clave]?.[0] ?? 0;                              // sin puja = 0, dato real
          const s2 = san[env.id];
          s2.n++; s2.trunc += trunc; s2.coste += mejor.ask / S; s2.horq += (mejor.ask - mejor.bid) / mejor.ask;
          if (salida === 0) s2.sinValor++;
          filas.push({
            env: env.id, sym, dia, salidaDia: ds, ano: dia.slice(0, 4), tipo, i,
            ret: (salida - mejor.ask) / mejor.ask,
            ask: mejor.ask, K: mejor.K, S,
            sen: sg.sen, senLimpia: sg.senLimpia, esNull: sg.esNull, movAyer: sg.movAyer, gapAyer: sg.gapAyer,
            diasNat: dteDe(dia, ds),
          });
        }
      }
    }
    cacheCad.clear();
    process.stderr.write(`\r   ${sym} · ${num(filas.length)} operaciones      `);
  }
  process.stderr.write("\n");
  writeFileSync(CACHE_FILAS, JSON.stringify(filas));
  console.log(`\n  SANIDAD (tubería reconstruida) — entradas ${num(entradas)}`);
  for (const env of ENVASES) {
    const s = san[env.id];
    console.log(`    ENVASE ${env.id}: ${num(s.n)} operaciones · huecos descartados ${num(s.huecos)} (${pct(s.huecos / (s.huecos + s.n))}) · sin contrato ${num(s.sinContrato)}`);
    console.log(`      coste medio de entrada ${pct(s.coste / s.n)} del subyacente · horquilla ${pct(s.horq / s.n)} de la prima · vencen sin valor ${pct(s.sinValor / s.n)} · truncadas ${pct(s.trunc / s.n)}`);
  }
} else {
  console.log(`\n  (operaciones leídas de la caché ${CACHE_FILAS})`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ACUMULADORES
// ══════════════════════════════════════════════════════════════════════════════════════════════
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
const suma = (a, d) => { a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; };
const ratio = (a) => (a.per > 0 ? a.gan / a.per : NaN);
const acierto = (a) => (a.n ? a.win / a.n : NaN);
const ganMedio = (a) => (a.win ? a.gan / a.win : 0);
const perMedio = (a) => (a.n - a.win ? a.per / (a.n - a.win) : 0);

function mide(envId, filtro, usarSenal) {
  const a = acc();
  for (const f of filas) {
    if (f.env !== envId) continue;
    if (usarSenal && !f.sen) continue;
    if (filtro && !filtro(f)) continue;
    suma(a, APUESTA * f.ret);
  }
  return a;
}
const ANOS = [...new Set(filas.map((f) => f.ano))].sort();
const ANOSPAN = Number(ANOS[ANOS.length - 1]) - Number(ANOS[0]) + 1;

// ══════════════════════════════════════════════════════════════════════════════════════════════
// FONTANERÍA A (cont.) — el hueco de «ayer» en los días que disparan
// ══════════════════════════════════════════════════════════════════════════════════════════════
{
  const dispA = filas.filter((f) => f.env === "A" && f.sen);
  const gaps = dispA.map((f) => f.gapAyer).filter((x) => x != null).sort((a, b) => a - b);
  const noDisp = filas.filter((f) => f.env === "A" && !f.sen).map((f) => f.gapAyer).filter((x) => x != null).sort((a, b) => a - b);
  const md = (v) => v[v.length >> 1];
  console.log(`\n  FONTANERÍA A (cont.) — días naturales entre los dos ficheros que forman el «movimiento de ayer»:`);
  console.log(`    con señal  : mediana ${md(gaps)} · más de 4 días naturales en ${pct(gaps.filter((x) => x > 4).length / gaps.length)} de los disparos`);
  console.log(`    sin señal  : mediana ${md(noDisp)} · más de 4 días naturales en ${pct(noDisp.filter((x) => x > 4).length / noDisp.length)}`);
  const largos = acc(), cortos = acc();
  for (const f of dispA) suma(f.gapAyer > 4 ? largos : cortos, APUESTA * f.ret);
  console.log(`    ratio de los disparos con hueco NORMAL (<= 4 días): ${r2(ratio(cortos))} (n=${num(cortos.n)})`);
  console.log(`    ratio de los disparos con hueco LARGO  (>  4 días): ${r2(ratio(largos))} (n=${num(largos.n)})`);
  const sinNull = acc();
  for (const f of filas) if (f.env === "A" && f.senLimpia) suma(sinNull, APUESTA * f.ret);
  console.log(`    FONTANERÍA B: ratio quitando los disparos que son un HUECO de precio y no un movimiento: ${r2(ratio(sinNull))} (n=${num(sinNull.n)})`);
  console.log(`    días de tenencia (calendario): mediana con señal ${md(dispA.map((f) => f.diasNat).sort((a, b) => a - b))} · sin señal ${md(filas.filter((f) => f.env === "A" && !f.sen).map((f) => f.diasNat).sort((a, b) => a - b))}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 0) EL PUNTO DE PARTIDA
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("  0) EL PUNTO DE PARTIDA — reproducción");
console.log(`${"═".repeat(104)}`);
console.log(`  | envase | muestra | n | ratio | acierta | ganador medio | perdedor medio | ops/año |`);
console.log(`  |---|---|---|---|---|---|---|---|`);
for (const env of ENVASES) {
  for (const [et, s] of [["sin regla", false], ["CON regla", true]]) {
    const a = mide(env.id, null, s);
    console.log(`  | ${env.id} | ${et} | ${num(a.n)} | **${r2(ratio(a))}** | ${pct(acierto(a))} | ${dol(ganMedio(a))} | ${dol(perMedio(a))} | ${num(a.n / ANOSPAN)} |`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1) QUITARLE TROZOS AL CALENDARIO
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("  1) QUITARLE TROZOS AL CALENDARIO — la regla y el listón, sobre la MISMA muestra recortada");
console.log(`${"═".repeat(104)}`);
const RECORTES = [
  ["muestra entera", () => true],
  ["sin febrero-mayo de 2020", (f) => !(f.dia >= "20200201" && f.dia <= "20200531")],
  ["sin 2020 ENTERO", (f) => f.ano !== "2020"],
  ["sin 2020 y sin 2026 (año a medias)", (f) => f.ano !== "2020" && f.ano !== "2026"],
  ["sin 2020, 2023 y 2026 (los 3 mejores años)", (f) => !["2020", "2023", "2026"].includes(f.ano)],
  ["sólo 2021-2026 (fuera de la primera mitad)", (f) => Number(f.ano) >= 2021],
  ["sólo 2016-2020", (f) => Number(f.ano) <= 2020],
];
for (const env of ENVASES) {
  console.log(`\n  ENVASE ${env.id} — ${env.et}`);
  console.log(`  | recorte | n con regla | ratio CON | acierta CON | ratio SIN | mejora |`);
  console.log(`  |---|---|---|---|---|---|`);
  for (const [et, fn] of RECORTES) {
    const c = mide(env.id, fn, true), b = mide(env.id, fn, false);
    console.log(`  | ${et} | ${num(c.n)} | **${r2(ratio(c))}** | ${pct(acierto(c))} | ${r2(ratio(b))} | ${(ratio(c) - ratio(b)).toFixed(2)} |`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2) AÑO A AÑO
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("  2) AÑO A AÑO (envase A) — con regla, sin regla, y la mejora");
console.log(`${"═".repeat(104)}`);
console.log(`  | año | n CON | ratio CON | acierta CON | n SIN | ratio SIN | acierta SIN | mejora del ratio |`);
console.log(`  |---|---|---|---|---|---|---|---|`);
let mejoraEn = 0, anosCuenta = 0, bajoUno = 0;
for (const a of ANOS) {
  const c = mide("A", (f) => f.ano === a, true), b = mide("A", (f) => f.ano === a, false);
  const rc = ratio(c), rb = ratio(b);
  if (c.n >= 20) { anosCuenta++; if (rc > rb) mejoraEn++; if (rc < 1) bajoUno++; }
  console.log(`  | ${a} | ${num(c.n)} | **${r2(rc)}** | ${pct(acierto(c))} | ${num(b.n)} | ${r2(rb)} | ${pct(acierto(b))} | ${(rc - rb).toFixed(2)} |`);
}
console.log(`  la regla mejora al listón en ${mejoraEn} de los ${anosCuenta} años con al menos 20 operaciones · años con ratio por debajo de 1: ${bajoUno}`);

// ── dejar fuera un año cada vez ────────────────────────────────────────────────────────────────
console.log(`\n  DEJAR FUERA UN AÑO CADA VEZ (envase A) — ¿cuál lo sostiene?`);
console.log(`  | año fuera | ratio CON regla | ratio SIN regla | mejora |`);
console.log(`  |---|---|---|---|`);
const looAno = [];
for (const a of ANOS) {
  const c = mide("A", (f) => f.ano !== a, true), b = mide("A", (f) => f.ano !== a, false);
  looAno.push({ a, r: ratio(c), rb: ratio(b) });
}
for (const x of [...looAno].sort((p, q) => p.r - q.r)) console.log(`  | sin ${x.a} | **${r2(x.r)}** | ${r2(x.rb)} | ${(x.r - x.rb).toFixed(2)} |`);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3) LAS CUATRO CRISIS
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("  3) 2018 · 2020 · 2022 · 2025 POR SEPARADO, en los dos envases");
console.log(`${"═".repeat(104)}`);
console.log(`  | año | A: n | A ratio CON | A ratio SIN | B: n | B ratio CON | B ratio SIN |`);
console.log(`  |---|---|---|---|---|---|---|`);
for (const a of ["2018", "2020", "2022", "2025"]) {
  const ca = mide("A", (f) => f.ano === a, true), ba = mide("A", (f) => f.ano === a, false);
  const cb = mide("B", (f) => f.ano === a, true), bb = mide("B", (f) => f.ano === a, false);
  console.log(`  | ${a} | ${num(ca.n)} | **${r2(ratio(ca))}** | ${r2(ratio(ba))} | ${num(cb.n)} | **${r2(ratio(cb))}** | ${r2(ratio(bb))} |`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4-5) CONCENTRACIÓN POR TICKER — y la MISMA cuenta sin regla
// ══════════════════════════════════════════════════════════════════════════════════════════════
function porTicker(envId, usarSenal) {
  const m = new Map();
  for (const f of filas) {
    if (f.env !== envId) continue;
    if (usarSenal && !f.sen) continue;
    if (!m.has(f.sym)) m.set(f.sym, acc());
    suma(m.get(f.sym), APUESTA * f.ret);
  }
  return [...m.entries()].map(([k, v]) => ({ k, v, r: ratio(v), neto: v.gan - v.per })).sort((a, b) => b.v.gan - a.v.gan);
}
function paraLaMitad(lista, total) {
  let ac = 0, c = 0;
  for (const t of lista) { if (t.v.gan <= 0) break; ac += t.v.gan; c++; if (ac >= total / 2) break; }
  return c;
}
console.log(`\n${"═".repeat(104)}`);
console.log("  4) CONCENTRACIÓN POR TICKER — la comparación que importa es CON regla contra SIN regla");
console.log(`${"═".repeat(104)}`);
for (const env of ENVASES) {
  const lc = porTicker(env.id, true), lb = porTicker(env.id, false);
  const tc = mide(env.id, null, true), tb = mide(env.id, null, false);
  console.log(`\n  ENVASE ${env.id}`);
  console.log(`    CON regla : ${lc.length} tickers · ${paraLaMitad(lc, tc.gan)} juntan la mitad de lo ganado · ${lc.filter((t) => t.r > 1).length} con ratio > 1 · ${lc.filter((t) => t.neto > 0).length} en positivo neto`);
  console.log(`    SIN regla : ${lb.length} tickers · ${paraLaMitad(lb, tb.gan)} juntan la mitad de lo ganado · ${lb.filter((t) => t.r > 1).length} con ratio > 1 · ${lb.filter((t) => t.neto > 0).length} en positivo neto`);
}
{
  const lc = porTicker("A", true), lb = porTicker("A", false);
  const rb = new Map(lb.map((t) => [t.k, t.r]));
  console.log(`\n  Envase A, ticker a ticker (ordenado por lo que aporta a lo ganado CON regla):`);
  console.log(`  | ticker | n CON | ratio CON | ratio SIN | ganado CON | perdido CON | neto CON |`);
  console.log(`  |---|---|---|---|---|---|---|`);
  for (const t of lc) console.log(`  | ${t.k} | ${num(t.v.n)} | ${r2(t.r)} | ${r2(rb.get(t.k))} | ${dol(t.v.gan)} | ${dol(t.v.per)} | ${dol(t.neto)} |`);
}

console.log(`\n${"═".repeat(104)}`);
console.log("  5) DEJAR FUERA TICKERS — uno cada vez, y los tres que más aportan");
console.log(`${"═".repeat(104)}`);
for (const env of ENVASES) {
  const lc = porTicker(env.id, true);
  const loo = lc.map((t) => {
    const c = mide(env.id, (f) => f.sym !== t.k, true), b = mide(env.id, (f) => f.sym !== t.k, false);
    return { k: t.k, r: ratio(c), rb: ratio(b) };
  }).sort((a, b) => a.r - b.r);
  console.log(`\n  ENVASE ${env.id} — los 5 tickers cuya ausencia MÁS daña:`);
  console.log(`  | sin este ticker | ratio CON | ratio SIN | mejora |`);
  console.log(`  |---|---|---|---|`);
  for (const x of loo.slice(0, 5)) console.log(`  | ${x.k} | **${r2(x.r)}** | ${r2(x.rb)} | ${(x.r - x.rb).toFixed(2)} |`);
  const top3 = lc.slice(0, 3).map((t) => t.k), top5 = lc.slice(0, 5).map((t) => t.k);
  for (const [et, lista] of [["los 3 mejores", top3], ["los 5 mejores", top5]]) {
    const c = mide(env.id, (f) => !lista.includes(f.sym), true), b = mide(env.id, (f) => !lista.includes(f.sym), false);
    console.log(`  quitando ${et} (${lista.join(", ")}): CON regla ${r2(ratio(c))} (n=${num(c.n)}, acierta ${pct(acierto(c))}) · SIN regla ${r2(ratio(b))}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6) CONCENTRACIÓN POR EVENTO — lo NORMAL en una estrategia convexa
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("  6) CONCENTRACIÓN POR EVENTO — que pocos billetes paguen la cuenta ES el diseño.");
console.log("     Lo que se mira es si la regla concentra MÁS que el listón, no si concentra.");
console.log(`${"═".repeat(104)}`);
for (const env of ENVASES) {
  console.log(`\n  ENVASE ${env.id}`);
  console.log(`  | muestra | n | ratio | top 1 billete | top 5 | top 10 | top 25 | ratio sin el top 1 | sin el top 5 | sin el top 10 |`);
  console.log(`  |---|---|---|---|---|---|---|---|---|---|`);
  for (const [et, us] of [["CON regla", true], ["SIN regla", false]]) {
    const w = filas.filter((f) => f.env === env.id && (!us || f.sen)).map((f) => APUESTA * f.ret).filter((d) => d > 0).sort((a, b) => b - a);
    const t = mide(env.id, null, us);
    const sh = (k) => pct(w.slice(0, k).reduce((a, b) => a + b, 0) / t.gan);
    const sinTop = (k) => r2((t.gan - w.slice(0, k).reduce((a, b) => a + b, 0)) / t.per);
    console.log(`  | ${et} | ${num(t.n)} | **${r2(ratio(t))}** | ${sh(1)} | ${sh(5)} | ${sh(10)} | ${sh(25)} | ${sinTop(1)} | ${sinTop(5)} | ${sinTop(10)} |`);
  }
}
{
  const top = filas.filter((f) => f.env === "A" && f.sen).sort((a, b) => b.ret - a.ret).slice(0, 12);
  console.log(`\n  Los 12 mayores billetes CON regla (envase A) — ¿repartidos en años y nombres, o todos juntos?`);
  console.log(`  | # | ticker | entrada | lado | strike | ask pagado | multiplicador | dólares |`);
  console.log(`  |---|---|---|---|---|---|---|---|`);
  top.forEach((f, i) => console.log(`  | ${i + 1} | ${f.sym} | ${f.dia} | ${f.tipo} | ${f.K} | $${f.ask.toFixed(2)} | ${(1 + f.ret).toFixed(1)}x | ${dol(APUESTA * f.ret)} |`));
  const anosTop = new Set(top.map((f) => f.ano)), tksTop = new Set(top.map((f) => f.sym));
  console.log(`  → ${anosTop.size} años distintos (${[...anosTop].sort().join(", ")}) y ${tksTop.size} tickers distintos`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 7) LA PRUEBA CRUZADA
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("  7) LA PRUEBA CRUZADA — quitar el año fuerte Y los tickers fuertes a la vez");
console.log(`${"═".repeat(104)}`);
{
  const lc = porTicker("A", true), top3 = lc.slice(0, 3).map((t) => t.k);
  const casos = [
    ["entera", () => true],
    ["sin 2020", (f) => f.ano !== "2020"],
    [`sin los 3 mejores tickers (${top3.join(", ")})`, (f) => !top3.includes(f.sym)],
    ["sin 2020 Y sin los 3 mejores tickers", (f) => f.ano !== "2020" && !top3.includes(f.sym)],
    ["sin 2020 Y sin el mayor billete", (f) => f.ano !== "2020" && !(f.sym === lc[0].k && f.ret > 50)],
  ];
  console.log(`  | recorte | n | ratio CON | acierta CON | ratio SIN | mejora |`);
  console.log(`  |---|---|---|---|---|---|`);
  for (const [et, fn] of casos) {
    const c = mide("A", fn, true), b = mide("A", fn, false);
    console.log(`  | ${et} | ${num(c.n)} | **${r2(ratio(c))}** | ${pct(acierto(c))} | ${r2(ratio(b))} | ${(ratio(c) - ratio(b)).toFixed(2)} |`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 8) EL BARAJADO, DOCE VECES — no una sola tirada
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("  8) EL BARAJADO CON DOCE DESPLAZAMIENTOS — la misma regla con el día equivocado");
console.log(`${"═".repeat(104)}`);
{
  const porTk = new Map();
  for (const f of filas) { if (!porTk.has(f.sym)) porTk.set(f.sym, new Map()); porTk.get(f.sym).set(f.dia, f.sen); }
  const diasTk = new Map();
  for (const [k, v] of porTk) diasTk.set(k, [...v.keys()].sort());
  const res = [];
  for (const D of [3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41]) {
    const a = acc(), b = acc();
    for (const f of filas) {
      const dias = diasTk.get(f.sym), idx = dias.indexOf(f.dia) - D;
      if (idx < 0) continue;
      const senB = porTk.get(f.sym).get(dias[idx]);
      if (!senB) continue;
      if (f.env === "A") suma(a, APUESTA * f.ret); else suma(b, APUESTA * f.ret);
    }
    res.push({ D, rA: ratio(a), nA: a.n, aA: acierto(a), rB: ratio(b) });
  }
  console.log(`  | desplazamiento (entradas) | A: n | A ratio | A acierta | B ratio |`);
  console.log(`  |---|---|---|---|---|`);
  for (const x of res) console.log(`  | ${x.D} | ${num(x.nA)} | ${r2(x.rA)} | ${pct(x.aA)} | ${r2(x.rB)} |`);
  const rs = res.map((x) => x.rA).sort((a, b) => a - b);
  const real = ratio(mide("A", null, true));
  console.log(`  barajados: del ${r2(rs[0])} al ${r2(rs[rs.length - 1])} · mediana ${r2(rs[rs.length >> 1])} · la señal de verdad ${r2(real)}`);
  console.log(`  barajados que igualan o superan a la señal de verdad: ${rs.filter((x) => x >= real).length} de ${rs.length}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 9) FONTANERÍA C — la misma regla con los CIERRES REALES (réplica independiente, 2021-2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("  9) LA MISMA REGLA CON LOS CIERRES REALES DE DISCO (2021-2026) — no con el precio deducido");
console.log(`${"═".repeat(104)}`);
{
  const CL = {};
  for (const t of TICKERS) { const p = `${CIERRES}/${t}.json`; if (existsSync(p)) { try { CL[t] = JSON.parse(readFileSync(p, "utf8")); } catch {} } }
  const senReal = new Map();
  let cubiertos = 0, deacuerdo = 0, comparados = 0;
  for (const t of TICKERS) {
    const c = CL[t]; if (!c) continue;
    const dias = Object.keys(c).sort();
    for (let i = 2; i < dias.length; i++) {
      const a = c[dias[i - 2]], b = c[dias[i - 1]];
      if (!(a > 0) || !(b > 0)) continue;
      senReal.set(`${t}|${dias[i]}`, Math.abs(b / a - 1) > UMBRAL);
    }
  }
  const a1 = acc(), a0 = acc(), base = acc();
  for (const f of filas) {
    if (f.env !== "A") continue;
    const sr = senReal.get(`${f.sym}|${f.dia}`);
    if (sr === undefined) continue;
    cubiertos++; comparados++;
    if (sr === f.sen) deacuerdo++;
    suma(base, APUESTA * f.ret);
    suma(sr ? a1 : a0, APUESTA * f.ret);
  }
  console.log(`  operaciones del envase A con cierre real disponible: ${num(cubiertos)}`);
  console.log(`  la señal deducida y la señal real coinciden en ${pct(deacuerdo / comparados)} de esas operaciones`);
  console.log(`  | señal calculada con | n | ratio | acierta |`);
  console.log(`  |---|---|---|---|`);
  console.log(`  | listón (todas, sólo donde hay cierre real) | ${num(base.n)} | ${r2(ratio(base))} | ${pct(acierto(base))} |`);
  console.log(`  | CIERRES REALES: ayer se movió más del 2% | ${num(a1.n)} | **${r2(ratio(a1))}** | ${pct(acierto(a1))} |`);
  console.log(`  | CIERRES REALES: ayer se movió menos | ${num(a0.n)} | ${r2(ratio(a0))} | ${pct(acierto(a0))} |`);
  const dp = acc();
  for (const f of filas) { if (f.env !== "A") continue; const sr = senReal.get(`${f.sym}|${f.dia}`); if (sr === undefined) continue; if (f.sen) suma(dp, APUESTA * f.ret); }
  console.log(`  (con la señal DEDUCIDA sobre esa misma muestra: ${r2(ratio(dp))}, n=${num(dp.n)})`);
}

console.log(`\n${"═".repeat(104)}`);
console.log("  PUERTAS ABIERTAS: aquí no se ha buscado ninguna regla nueva. Se ha tomado UNA regla ya");
console.log("  fijada («ayer más del 2%») y se le han aplicado 7 recortes de calendario, 11 años fuera de");
console.log("  uno en uno, 28 tickers fuera de uno en uno, 5 recortes por evento y 12 barajados.");
console.log(`${"═".repeat(104)}\n`);
