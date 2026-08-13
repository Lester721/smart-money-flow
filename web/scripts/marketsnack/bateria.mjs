// BATERÍA COMPLETA — las 8 pruebas declaradas en docs/preregistro-marketsnack.md (ampliación).
//
// Se corren TODAS y se enseñan TODAS, incluidas las que fallan. Enseñar solo la que gana es
// exactamente cómo se fabrica una señal falsa: con 32 pruebas, una o dos pasan por azar.
//
// Umbral: |t| > 3,1 (Bonferroni para ~32 pruebas), más monotonía y coherencia entre las dos
// mitades del histórico. Los tres a la vez.
//
// La prueba B (comprar la opción) va aparte, en medir-opcion.mjs: necesita bajar precios reales
// de cada contrato y eso tarda.
//
// Uso: node scripts/marketsnack/bateria.mjs

import fs from "node:fs";
import path from "node:path";
import rl from "node:readline";

const FLUJO = "data/marketsnack/flujo-prima1000k.jsonl";
const CACHE = "data/marketsnack/cierres";
const UMBRAL_T = 3.3;
const HOR = [0, 1, 3, 5, 21, 63];   // 0 = intradía (day) · 1-5 (swing) · 21-63 (meses)

const COMPRA = new Set(["ASKSIDE", "ABOVE_ASK", "AT_ASK"]);
const VENTA = new Set(["BIDSIDE", "BELOW_BID", "AT_BID"]);
const INDICES = new Set(["SPX", "SPXW", "NDX", "RUT", "VIX", "XSP", "DJX"]);
const parsear = (s) => { const m = /^([A-Z]+)(\d{6})([CP])(\d{8})$/.exec(s); return m ? m[1] : null; };

const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const de = (a) => { const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const tDif = (a, b) => (media(a) - media(b)) / Math.sqrt(de(a) ** 2 / a.length + de(b) ** 2 / b.length);
const tUno = (a) => media(a) / (de(a) / Math.sqrt(a.length));

// ── cargar y agregar por ticker-día ──────────────────────────────────────────
console.log(`═══ BATERÍA COMPLETA · MarketSnack ═══`);
console.log(`   umbral |t| > ${UMBRAL_T} (Bonferroni para ~48 pruebas)\n`);

const ev = new Map();
for await (const l of rl.createInterface({ input: fs.createReadStream(FLUJO) })) {
  if (!l.trim()) continue;
  let t; try { t = JSON.parse(l); } catch { continue; }
  const raiz = parsear(t.symbol ?? "");
  if (!raiz || !t.timestamp || !(t.premium > 0) || !(t.asset_price > 0)) continue;
  const dia = t.timestamp.slice(0, 10), k = `${raiz}|${dia}`;
  let e = ev.get(k);
  if (!e) e = { raiz, dia, prima: 0, scoreP: 0, dir: 0, deseC: 0, deseV: 0, n: 0,
                agresivaC: 0, agresivaV: 0, precioP: 0, scoreMax: -1, primaMax5: 0, primaMax10: 0 }, ev.set(k, e);
  const signo = t.sentiment === "bullish" ? 1 : t.sentiment === "bearish" ? -1 : 0;
  e.prima += t.premium;
  e.scoreP += (t.score ?? 0) * t.premium;
  e.precioP += t.asset_price * t.premium;
  e.dir += signo * t.premium;
  e.n++;
  if ((t.score ?? -1) > e.scoreMax) e.scoreMax = t.score ?? -1;
  if (COMPRA.has(t.side)) e.deseC += t.premium; else if (VENTA.has(t.side)) e.deseV += t.premium;
  if (t.side === "ABOVE_ASK") e.agresivaC += t.premium;
  if (t.side === "BELOW_BID") e.agresivaV += t.premium;
  if (t.premium >= 5e6) e.primaMax5 += t.premium;
  if (t.premium >= 1e7) e.primaMax10 += t.premium;
}

const serie = (r) => { try { const j = JSON.parse(fs.readFileSync(path.join(CACHE, `${r}.json`), "utf8")); return j || null; } catch { return null; } };

// Prima típica por ticker, para la prueba E (rareza). Se calcula sobre TODA la muestra: es una
// referencia de escala, no una predicción, así que no mete look-ahead direccional.
const primaTipica = new Map();
for (const e of ev.values()) {
  if (!primaTipica.has(e.raiz)) primaTipica.set(e.raiz, []);
  primaTipica.get(e.raiz).push(e.prima);
}
for (const [k, v] of primaTipica) { v.sort((a, b) => a - b); primaTipica.set(k, v[Math.floor(v.length / 2)]); }

const base = [];
for (const e of ev.values()) {
  const s = serie(e.raiz); if (!s) continue;
  const i = s.findIndex(([f]) => f === e.dia); if (i < 0) continue;
  const cierreHoy = s[i][1];
  const precioOp = e.precioP / e.prima;                    // precio medio del subyacente al operar
  const clasif = e.deseC + e.deseV;
  const f = {
    raiz: e.raiz, dia: e.dia, n: e.n, prima: e.prima,
    score: e.scoreP / e.prima, scoreMax: e.scoreMax,
    dir: Math.sign(e.dir),
    dese: clasif > 0 ? (e.deseC - e.deseV) / clasif : 0,
    agresiva: (e.agresivaC + e.agresivaV) > 0 ? (e.agresivaC - e.agresivaV) / (e.agresivaC + e.agresivaV) : 0,
    rareza: e.prima / (primaTipica.get(e.raiz) || e.prima),
    esIndice: INDICES.has(e.raiz),
    prima5: e.primaMax5, prima10: e.primaMax10,
    movAbs: {},
  };
  // Horizonte 0 = intradía: del precio al que operaron hasta el cierre del mismo día.
  // Usa `asset_price`, que es dato suyo del momento — no hay forma de mirar el futuro.
  f.r0 = ((cierreHoy - precioOp) / precioOp) * 100;
  f.movAbs[0] = Math.abs(f.r0);
  for (const h of [1, 3, 5, 21, 63]) {
    if (i + h >= s.length) continue;
    f[`b${h}`] = ((s[i + h][1] - cierreHoy) / cierreHoy) * 100;   // bruto desde el cierre de hoy
    f.movAbs[h] = Math.abs(f[`b${h}`]);
  }
  base.push(f);
}
console.log(`   eventos ticker-día con precios: ${base.length.toLocaleString("es-ES")}\n`);

// ── motor de prueba ──────────────────────────────────────────────────────────
const resultados = [];

function probar(nombre, filas, ordenar, firmar) {
  for (const h of HOR) {
    const campo = h === 0 ? "r0" : `b${h}`;
    const con = filas.filter((f) => f[campo] != null);
    if (con.length < 100) continue;

    // Rendimiento firmado por la variable que se está probando.
    const firmados = con.map((f) => f[campo] * firmar(f)).filter((x) => Number.isFinite(x));
    const t = tUno(firmados), m = media(firmados);

    // Y por grupos, para ver si es monótona.
    const ord = [...con].sort((a, b) => ordenar(a) - ordenar(b));
    const tam = Math.floor(ord.length / 5), g = [];
    for (let q = 0; q < 5; q++) {
      const tr = ord.slice(q * tam, q === 4 ? ord.length : (q + 1) * tam);
      g.push(media(tr.map((f) => f[campo] * firmar(f))));
    }
    const mono = g.every((x, i) => i === 0 || x >= g[i - 1]);

    // Las dos mitades en el tiempo.
    const porFecha = [...con].sort((a, b) => (a.dia < b.dia ? -1 : 1));
    const c = Math.floor(porFecha.length / 2);
    const m1 = media(porFecha.slice(0, c).map((f) => f[campo] * firmar(f)));
    const m2 = media(porFecha.slice(c).map((f) => f[campo] * firmar(f)));
    const coherente = Math.sign(m1) === Math.sign(m2) && Math.sign(m) === Math.sign(m1);

    const pasa = Math.abs(t) > UMBRAL_T && mono && coherente;
    resultados.push({ nombre, h, n: con.length, m, t, mono, coherente, pasa, m1, m2 });
  }
}

const idem = () => 1;

// A · intradía ya está incluido como h=0 en todas
probar("A/H1 score (todo)", base, (f) => f.score, (f) => f.dir);
probar("A/H2 desequilibrio", base, (f) => f.dese, (f) => Math.sign(f.dese));

// D · extremos del score
probar("D score >= 90", base.filter((f) => f.scoreMax >= 90), (f) => f.score, (f) => f.dir);
probar("D score >= 95", base.filter((f) => f.scoreMax >= 95), (f) => f.score, (f) => f.dir);

// E · rareza (prima del día frente a la típica del ticker)
probar("E rareza x3", base.filter((f) => f.rareza >= 3), (f) => f.rareza, (f) => f.dir);
probar("E rareza x10", base.filter((f) => f.rareza >= 10), (f) => f.rareza, (f) => f.dir);

// F · solo lo más agresivo
probar("F agresivas (ABOVE_ASK/BELOW_BID)", base.filter((f) => f.agresiva !== 0), (f) => f.agresiva, (f) => Math.sign(f.agresiva));

// G · sin índices / solo índices
probar("G sin índices", base.filter((f) => !f.esIndice), (f) => f.score, (f) => f.dir);
probar("G solo índices", base.filter((f) => f.esIndice), (f) => f.score, (f) => f.dir);
probar("G sin índices · desequilibrio", base.filter((f) => !f.esIndice), (f) => f.dese, (f) => Math.sign(f.dese));

// H · prima muy grande
probar("H con prima >= $5M", base.filter((f) => f.prima5 > 0), (f) => f.score, (f) => f.dir);
probar("H con prima >= $10M", base.filter((f) => f.prima10 > 0), (f) => f.score, (f) => f.dir);

// ── C · valor como buscador: ¿se mueven MÁS los días que aparecen? ───────────
// No mide dirección, mide magnitud. Se compara el movimiento absoluto de un ticker-día señalado
// contra el movimiento típico de ESE MISMO ticker en el resto de días de la muestra.
console.log(`${"─".repeat(78)}`);
console.log(`C · ¿Los días que aparecen en su cinta se mueven MÁS de lo normal?\n`);
for (const h of HOR) {
  const porTicker = new Map();
  for (const f of base) { if (f.movAbs[h] == null) continue;
    if (!porTicker.has(f.raiz)) porTicker.set(f.raiz, []);
    porTicker.get(f.raiz).push(f.movAbs[h]); }
  const relativos = [];
  for (const [raiz, movs] of porTicker) {
    if (movs.length < 5) continue;
    const s = serie(raiz); if (!s || s.length < 20) continue;
    // Movimiento típico del ticker en TODA la ventana, señalado o no.
    const todos = [];
    for (let i = 0; i + Math.max(h, 1) < s.length; i++) todos.push(Math.abs((s[i + Math.max(h, 1)][1] - s[i][1]) / s[i][1]) * 100);
    if (todos.length < 10) continue;
    const tip = media(todos);
    if (!(tip > 0)) continue;
    for (const m of movs) relativos.push(m / tip);
  }
  if (relativos.length < 100) continue;
  const t = (media(relativos) - 1) / (de(relativos) / Math.sqrt(relativos.length));
  console.log(`   +${h}d  ·  n=${relativos.length}  ·  se mueven ${media(relativos).toFixed(2)}x lo normal  ·  t = ${t.toFixed(2)}  ${Math.abs(t) > UMBRAL_T ? "← SIGNIFICATIVO" : ""}`);
}

// ── informe ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(78)}`);
console.log(`PRUEBAS DIRECCIONALES — TODAS, incluidas las que fallan\n`);
console.log(`   ${"prueba".padEnd(34)} h      n   rend%      t   mono  coher  PASA`);
for (const r of resultados) {
  console.log(`   ${r.nombre.padEnd(34)} ${String(r.h).padStart(1)}  ${String(r.n).padStart(5)}  ${(r.m >= 0 ? "+" : "") + r.m.toFixed(3)}`.padEnd(62) +
    `${r.t.toFixed(2).padStart(6)}   ${r.mono ? " SÍ " : " no "}  ${r.coherente ? " SÍ " : " no "}   ${r.pasa ? "*** SÍ ***" : ""}`);
}

const pasan = resultados.filter((r) => r.pasa);
console.log(`\n${"═".repeat(78)}`);
console.log(`   pruebas corridas: ${resultados.length}   ·   pasan las tres condiciones: ${pasan.length}`);
if (!pasan.length) {
  console.log(`\n   Ninguna. Con ${resultados.length} pruebas y un umbral de |t| > ${UMBRAL_T}, esperaríamos`);
  console.log(`   ~0,05 falsos positivos por azar. No ha salido ni eso.\n`);
} else {
  console.log(`\n   ⚠ Ojo: pasar aquí NO es una conclusión. Hay que re-probarlo sobre datos que`);
  console.log(`     no hayan participado, y luego contra costes reales.\n`);
  for (const r of pasan) console.log(`     ${r.nombre}  +${r.h}d  ·  ${r.m.toFixed(3)}%  ·  t=${r.t.toFixed(2)}  ·  mitades ${r.m1.toFixed(3)} / ${r.m2.toFixed(3)}`);
  console.log("");
}
