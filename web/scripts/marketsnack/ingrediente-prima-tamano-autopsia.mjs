// AUTOPSIA DEL ÚNICO CANDIDATO — nOps a 20 días (y top3Share, el segundo).
//
// En la corrida principal `nOps` (nº de operaciones de ≥$100k antes de las 15:00) da a 20 días
// una separación de −1,435% con t(día, Newey-West) = −3,39 sobre 48 días y el mismo signo en los
// tres tercios. Eso pasaría el listón de 3,24. ANTES de decir nada hay que romperlo, porque:
//
//   1. Newey-West con retardo 20 sobre 48 días es un estimador que NO es de fiar: la regla
//      habitual pide retardo ≈ 4·(T/100)^(2/9) ≈ 3, no 20. Con L/T = 0,42 la varianza sale
//      sesgada a la baja y la t inflada.
//   2. Con 48 días de entrada y ventanas de 20 días sólo hay ~2,4 ventanas INDEPENDIENTES.
//   3. Si el orden transversal de la métrica es persistente (los mismos 15 nombres arriba todos
//      los días), entonces no son 48 apuestas: es UNA apuesta a que los nombres calientes
//      cayeron en junio-julio de 2026. Eso es un episodio, no una señal.
//
// Las tres se comprueban aquí. Uso:
//   node --env-file=.env.local --import tsx --max-old-space-size=10240 \
//     scripts/marketsnack/ingrediente-prima-tamano-autopsia.mjs

import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

const DIR_FLUJO = path.resolve("scripts/cache-theta/marketsnack/flujo-100k");
const DIR_CHART = path.resolve("scripts/cache-theta/marketsnack/aux/chart-all");
const SALIDA = path.resolve("scripts/marketsnack/ingrediente-prima-tamano-autopsia.json");

const CORTE_MS = 19 * 3600e3, APERTURA_MS = 13.5 * 3600e3;
const MIN_OPS = 10, DIAS_CALENTAMIENTO = 5;
const CUENTA = 56389;

const mediana = (v) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const media = (v) => v.reduce((a, x) => a + x, 0) / v.length;
const desv = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };

// ── datos (misma construcción que la corrida principal) ──────────────────────────────────
const HOY = new Date().toISOString().slice(0, 10);
const PRECIO = new Map();
for (const f of fs.readdirSync(DIR_CHART)) {
  const t = f.replace(".json.gz", "");
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR_CHART, f))).toString("utf8"));
  let serie = j.data.map((p) => ({ f: p.t.slice(0, 10), v: p.v })).filter((p) => p.v > 0);
  if (serie.length && serie[serie.length - 1].f >= HOY) serie = serie.slice(0, -1);
  if (serie.length < 60) continue;
  PRECIO.set(t, { serie, idx: new Map(serie.map((p, i) => [p.f, i])) });
}

const ficheros = fs.readdirSync(DIR_FLUJO).filter((f) => f.endsWith(".jsonl.gz")).sort();
const filas = [];
for (let d = 0; d < ficheros.length; d++) {
  const fecha = ficheros[d].slice(0, 10);
  const t0 = Date.parse(fecha + "T00:00:00Z");
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(DIR_FLUJO, ficheros[d]))).toString("utf8");
  const porTicker = new Map();
  for (const linea of txt.split("\n")) {
    if (!linea) continue;
    const r = JSON.parse(linea);
    const s = r.symbol || "", raiz = s.slice(0, -15), tipo = s.slice(-9, -8);
    if (!/^\d{8}$/.test(s.slice(-8)) || !/^[CP]$/.test(tipo) || !/^\d{6}$/.test(s.slice(-15, -9)) || !raiz) continue;
    if (!(r.ask_price > 0) || !(r.bid_price > 0) || r.bid_price > r.ask_price) continue;
    const off = Date.parse(r.timestamp) - t0;
    if (off < APERTURA_MS || off > CORTE_MS) continue;
    if (!PRECIO.has(raiz)) continue;
    let a = porTicker.get(raiz);
    if (!a) { a = { primas: [] }; porTicker.set(raiz, a); }
    a.primas.push(r.premium);
  }
  if (d < DIAS_CALENTAMIENTO) continue;
  for (const [tk, a] of porTicker) {
    if (a.primas.length < MIN_OPS) continue;
    const total = a.primas.reduce((x, y) => x + y, 0);
    const top3 = [...a.primas].sort((x, y) => y - x).slice(0, 3).reduce((x, y) => x + y, 0);
    const p = PRECIO.get(tk), i = p.idx.get(fecha);
    if (i == null) continue;
    const fila = { ticker: tk, fecha, nOps: a.primas.length, top3Share: top3 / total, entrada: p.serie[i].v };
    for (const h of [1, 5, 20]) fila["r" + h] = i + h < p.serie.length ? p.serie[i + h].v / p.serie[i].v - 1 : null;
    filas.push(fila);
  }
}
console.log(`símbolo-día: ${filas.length}`);

// ── serie de separaciones diarias ────────────────────────────────────────────────────────
function serieDiaria(campo, h) {
  const porDia = new Map();
  for (const f of filas) { if (f["r" + h] == null) continue;
    if (!porDia.has(f.fecha)) porDia.set(f.fecha, []); porDia.get(f.fecha).push(f); }
  const out = [];
  for (const fe of [...porDia.keys()].sort()) {
    const g = [...porDia.get(fe)].sort((a, b) => b[campo] - a[campo]);
    const k = Math.floor(g.length / 3);
    if (k < 3) continue;
    out.push({ fecha: fe, spread: media(g.slice(0, k).map((x) => x["r" + h])) - media(g.slice(-k).map((x) => x["r" + h])),
      alto: g.slice(0, k), bajo: g.slice(-k) });
  }
  return out;
}

const informe = {};
for (const [campo, h] of [["nOps", 20], ["top3Share", 20], ["nOps", 5], ["nOps", 1]]) {
  const clave = `${campo}_h${h}`;
  const S = serieDiaria(campo, h);
  const sp = S.map((x) => x.spread);
  const m = media(sp), sd = desv(sp);

  // ── 1. ventanas NO SOLAPADAS: el nº de apuestas de verdad independientes ──
  const noSol = [];
  for (let i = 0; i < S.length; i += h) noSol.push(sp[i]);
  const tNoSol = noSol.length >= 3 ? media(noSol) / (desv(noSol) / Math.sqrt(noSol.length)) : null;

  // ── 2. bootstrap de bloques móviles (bloque = h): p honesta con solapamiento ──
  const L = Math.max(2, h), B = 20000;
  let extremos = 0;
  const centrado = sp.map((x) => x - m);            // H0: separación cero
  for (let b = 0; b < B; b++) {
    let acc = 0, n = 0;
    while (n < sp.length) {
      const ini = Math.floor(Math.random() * (sp.length - L + 1));
      for (let j = 0; j < L && n < sp.length; j++, n++) acc += centrado[ini + j];
    }
    if (Math.abs(acc / sp.length) >= Math.abs(m)) extremos++;
  }
  const pBloque = (extremos + 1) / (B + 1);

  // ── 3. ¿es el mismo puñado de nombres todos los días? ──
  const cuentaAlto = new Map(), cuentaBajo = new Map();
  for (const d of S) {
    for (const f of d.alto) cuentaAlto.set(f.ticker, (cuentaAlto.get(f.ticker) ?? 0) + 1);
    for (const f of d.bajo) cuentaBajo.set(f.ticker, (cuentaBajo.get(f.ticker) ?? 0) + 1);
  }
  const topAlto = [...cuentaAlto].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const permanencia = topAlto.filter(([, c]) => c >= S.length * 0.8).length;

  // persistencia del orden: correlación de rango de la métrica entre días consecutivos
  const porDiaMap = new Map();
  for (const f of filas) { if (!porDiaMap.has(f.fecha)) porDiaMap.set(f.fecha, new Map());
    porDiaMap.get(f.fecha).set(f.ticker, f[campo]); }
  const fechas = [...porDiaMap.keys()].sort();
  const corrs = [];
  for (let i = 1; i < fechas.length; i++) {
    const a = porDiaMap.get(fechas[i - 1]), b = porDiaMap.get(fechas[i]);
    const com = [...b.keys()].filter((t) => a.has(t));
    if (com.length < 20) continue;
    const ra = com.map((t) => a.get(t)), rb = com.map((t) => b.get(t));
    const rk = (v) => { const o = v.map((x, i2) => [x, i2]).sort((x, y) => x[0] - y[0]); const r = new Array(v.length);
      o.forEach(([, i2], j) => (r[i2] = j)); return r; };
    const x = rk(ra), y = rk(rb), mx = media(x), my = media(y);
    let num = 0, dx = 0, dy = 0;
    for (let k = 0; k < x.length; k++) { num += (x[k] - mx) * (y[k] - my); dx += (x[k] - mx) ** 2; dy += (y[k] - my) ** 2; }
    corrs.push(num / Math.sqrt(dx * dy));
  }

  // ── 4. ¿aguanta si se quita el ticker que más manda? ──
  const sinPeor = (() => {
    const tk = topAlto[0]?.[0];
    if (!tk) return null;
    const S2 = (() => {
      const porDia = new Map();
      for (const f of filas) { if (f["r" + h] == null || f.ticker === tk) continue;
        if (!porDia.has(f.fecha)) porDia.set(f.fecha, []); porDia.get(f.fecha).push(f); }
      const out = [];
      for (const fe of [...porDia.keys()].sort()) {
        const g = [...porDia.get(fe)].sort((a, b) => b[campo] - a[campo]);
        const k = Math.floor(g.length / 3);
        if (k < 3) continue;
        out.push(media(g.slice(0, k).map((x) => x["r" + h])) - media(g.slice(-k).map((x) => x["r" + h])));
      }
      return out;
    })();
    return { ticker: tk, sep: media(S2), t: media(S2) / (desv(S2) / Math.sqrt(S2.length)) };
  })();

  informe[clave] = {
    dias: S.length, sep: m, sdDiaria: sd,
    ventanasIndependientes: noSol.length, sepNoSolapada: noSol.length ? media(noSol) : null, tNoSolapada: tNoSol,
    pBootstrapBloques: pBloque,
    persistenciaRangoDiaAdia: corrs.length ? media(corrs) : null,
    nombresFijosEnElTercioAlto: permanencia,
    top10Alto: topAlto.map(([t, c]) => `${t} ${((c / S.length) * 100).toFixed(0)}%`),
    sinElMayor: sinPeor,
    primeraFecha: S[0]?.fecha, ultimaFecha: S[S.length - 1]?.fecha,
  };

  console.log(`\n═══ ${clave} ═══`);
  console.log(`  días ${S.length} (${S[0]?.fecha} → ${S[S.length - 1]?.fecha}) · separación media ${(m * 100).toFixed(3)}% · sd diaria ${(sd * 100).toFixed(2)}%`);
  console.log(`  ventanas NO solapadas: ${noSol.length} · sep ${noSol.length ? (media(noSol) * 100).toFixed(3) + "%" : "—"} · t ${tNoSol == null ? "—" : tNoSol.toFixed(2)}`);
  console.log(`  bootstrap de bloques (L=${L}, B=${B}): p = ${pBloque.toFixed(4)}`);
  console.log(`  persistencia del orden día a día (rho de rango): ${(informe[clave].persistenciaRangoDiaAdia ?? 0).toFixed(3)}`);
  console.log(`  nombres del tercio alto presentes ≥80% de los días: ${permanencia} de 10`);
  console.log(`  los 10 más frecuentes arriba: ${informe[clave].top10Alto.join(" · ")}`);
  if (sinPeor) console.log(`  quitando ${sinPeor.ticker}: sep ${(sinPeor.sep * 100).toFixed(3)}% · t ${sinPeor.t.toFixed(2)}`);
}

fs.writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), cuenta: CUENTA, informe }, null, 1));
console.log(`\n→ ${SALIDA}`);
