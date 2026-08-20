// LOS CONTROLES DEL HALLAZGO DE LA COLA — lo que decide si el filtro sirve o es aritmética.
//
// cola-vix.mjs encontró que el tercio ALTO de la familia VIX concentra los días de pérdida
// > $2.000 (z hasta 4,04 contra un listón de 3,05, y +++ en los tres años). Y que tirar ese
// tercio baja la PEOR RACHA de $15.176 a $8.647 conservando el 81% del ingreso.
//
// ═══ POR QUÉ ESTE FICHERO ════════════════════════════════════════════════════════════════════
// Quitar 217 de 653 días BAJA LA RACHA SOLO POR ADELGAZAR LA SERIE. Un tercio menos de días es
// un tercio menos de oportunidades de encadenar pérdidas. Si no comparo contra un descarte AL
// AZAR del mismo tamaño, estoy midiendo aritmética y llamándolo hallazgo.
//
// Cuatro controles:
//   1. PERMUTACIÓN — 5.000 descartes aleatorios de 217 días. ¿Cuántos consiguen A LA VEZ tanto
//      ingreso como el filtro Y tan poca racha? Ese es el p-valor conjunto de verdad.
//   2. WALK-FORWARD — el umbral con la ventana del PASADO, no con la muestra entera. Los tercios
//      de cola-vix.mjs usan el corte de los 653 días: eso no lo sabías el 2 de enero de 2024.
//   3. AÑO A AÑO — racha e ingreso de cada año por separado.
//   4. MECANISMO — de dónde sale, y por qué el PEOR DÍA no se mueve ni un dólar.

import { readFileSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";

const VDIR = "scripts/cache-theta/vol-indices";
const DIAS_ANO = 252, MALO = 2000, MUYMALO = 4000, PERMS = 5000;

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (x) => (x * 100).toFixed(1) + "%";
const perc = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const corr = (a, b) => {
  const n = a.length, ma = media(a), mb = media(b);
  let sa = 0, sb = 0, sc = 0;
  for (let i = 0; i < n; i++) { sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; sc += (a[i] - ma) * (b[i] - mb); }
  return sc / Math.sqrt(sa * sb);
};

// ── datos, idénticos a cola-vix.mjs ─────────────────────────────────────────
const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
filas.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
const claveDe = (f) => f.replace(/-/g, "");
const diasSesion = new Set(filas.map((f) => claveDe(f.fecha)));
const V = {};
for (const s of ["VIX", "VIX9D", "VIX3M", "VVIX"]) {
  const bruto = JSON.parse(readFileSync(VDIR + "/" + s + ".json", "utf8"));
  V[s] = Object.fromEntries(Object.entries(bruto).filter(([k]) => diasSesion.has(k)));  // fuera festivos
}
const anterior = (serie, fecha, n) => {
  const d = claveDe(fecha), ks = Object.keys(serie).filter((k) => k < d).sort();
  return ks.length >= n ? serie[ks[ks.length - n]] : null;
};
for (const f of filas) {
  const vix = anterior(V.VIX, f.fecha, 1), v9 = anterior(V.VIX9D, f.fecha, 1), v3 = anterior(V.VIX3M, f.fecha, 1);
  f.vix = vix;
  f.term9 = vix && v9 ? v9 / vix : null;
  f.term3m = vix && v3 ? vix / v3 : null;
  f.vvix = anterior(V.VVIX, f.fecha, 1);
  f.mov = Math.abs(f.cierre - f.sp11);                 // lo que se movió el SPX de 11:00 al cierre
}
radiografia(filas, ["pl", "credito", "vix", "term9", "term3m", "vvix", "mov"], "controles", { maxCeros: 0.2 });

function racha(serie) { let c = 0, p = 0, d = 0; for (const x of serie) { c += x; p = Math.max(p, c); d = Math.max(d, p - c); } return d; }
function cartera(pls, nDias = filas.length) {
  const op = pls.filter((x) => x !== 0);
  return {
    total: pls.reduce((a, b) => a + b, 0), anual: pls.reduce((a, b) => a + b, 0) / (nDias / DIAS_ANO),
    peorDia: op.length ? Math.min(...op) : 0, dd: racha(pls), n: op.length,
    p5: op.length ? perc(op, 0.05) : 0, p1: op.length ? perc(op, 0.01) : 0,
    n2k: op.filter((x) => x < -MALO).length, n4k: op.filter((x) => x < -MUYMALO).length,
  };
}
const BASE = cartera(filas.map((f) => f.pl));

// ── LOS CANDIDATOS que salieron de cola-vix.mjs ─────────────────────────────
const rank = (campo) => {
  const val = filas.filter((f) => f[campo] != null && isFinite(f[campo]));
  const ord = [...val].sort((a, b) => a[campo] - b[campo]);
  const m = new Map(); ord.forEach((f, i) => m.set(f.fecha, i / (ord.length - 1))); return m;
};
const Rv = rank("vix"), R9 = rank("term9"), R3 = rank("term3m"), Rvv = rank("vvix");
const CAND = [
  ["C", "term9",        (f) => f.term9],
  ["D", "term3m",       (f) => f.term3m],
  ["E", "vvix",         (f) => f.vvix],
  ["A", "vix",          (f) => f.vix],
  ["K", "term9+term3m", (f) => (R9.get(f.fecha) == null || R3.get(f.fecha) == null ? null : (R9.get(f.fecha) + R3.get(f.fecha)) / 2)],
  ["H", "vix+vvix",     (f) => (Rv.get(f.fecha) == null || Rvv.get(f.fecha) == null ? null : (Rv.get(f.fecha) + Rvv.get(f.fecha)) / 2)],
];

console.log("\n" + "=".repeat(104));
console.log("  CONTROLES · base " + eur(BASE.anual) + "/año · peor día " + eur(BASE.peorDia) + " · peor racha " + eur(BASE.dd) +
            " · " + BASE.n2k + " días < −$2k · " + BASE.n4k + " < −$4k");
console.log("=".repeat(104));

// ═══ CONTROL 1 · PERMUTACIÓN ════════════════════════════════════════════════
console.log("\n## 1 · PERMUTACIÓN — ¿bate el filtro a tirar 217 días AL AZAR?\n");
console.log("De 5.000 descartes aleatorios del mismo tamaño, ¿cuántos logran a la vez TANTO ingreso");
console.log("como el filtro Y TAN POCA racha? Ese porcentaje es el p-valor conjunto.\n");
console.log("| # | señal | días fuera | ingreso/año | racha | azar: racha p50 | azar: racha p5 | p conjunto | veredicto |");
console.log("|---|---|---|---|---|---|---|---|---|");
const plAll = filas.map((f) => f.pl);
const permCache = {};
function permutar(nFuera) {
  if (permCache[nFuera]) return permCache[nFuera];
  const res = [];
  const idx = filas.map((_, i) => i);
  let seed = 20260819;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let p = 0; p < PERMS; p++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const fuera = new Set(idx.slice(0, nFuera));
    const pls = plAll.map((x, i) => (fuera.has(i) ? 0 : x));
    res.push({ dd: racha(pls), anual: pls.reduce((a, b) => a + b, 0) / (filas.length / DIAS_ANO) });
  }
  permCache[nFuera] = res; return res;
}
const control1 = [];
for (const [id, nom, fn] of CAND) {
  const val = filas.filter((f) => fn(f) != null && isFinite(fn(f)));
  const ord = [...val].sort((a, b) => fn(b) - fn(a));
  const k = Math.floor(ord.length / 3);
  const fuera = new Set(ord.slice(0, k).map((f) => f.fecha));
  const c = cartera(filas.map((f) => (fuera.has(f.fecha) ? 0 : f.pl)));
  const perms = permutar(fuera.size);
  const dds = perms.map((p) => p.dd).sort((a, b) => a - b);
  const mejores = perms.filter((p) => p.anual >= c.anual && p.dd <= c.dd).length;
  const pv = mejores / PERMS;
  control1.push({ id, nom, c, pv, ddP50: perc(dds, 0.5), ddP5: perc(dds, 0.05) });
  console.log("| " + id + " | `" + nom + "` | " + fuera.size + " | " + eur(c.anual) + " (" + pct(c.anual / BASE.anual) + ") | " +
              eur(c.dd) + " | " + eur(perc(dds, 0.5)) + " | " + eur(perc(dds, 0.05)) + " | **" + (pv * 100).toFixed(2) + "%** | " +
              (pv < 0.05 ? "🟢 bate al azar" : "no bate al azar") + " |");
}

// ═══ CONTROL 2 · WALK-FORWARD ═══════════════════════════════════════════════
console.log("\n## 2 · WALK-FORWARD — el umbral con la ventana del PASADO (mín. 120 días), no con la muestra entera\n");
console.log("| # | señal | corte | días fuera | ingreso/año | % retenido | peor día | racha | delta racha | p5 | p1 | <−$2k | <−$4k |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const control2 = [];
for (const [id, nom, fn] of CAND) {
  for (const q of [2 / 3, 0.8, 0.9]) {
    const hist = [], pls = [];
    let fueraN = 0, sinUmbral = 0;
    for (const f of filas) {
      const v = fn(f);
      let opera = true;
      if (v == null || !isFinite(v)) { opera = true; sinUmbral++; }          // sin señal se OPERA (no se rellena)
      else if (hist.length < 120) { opera = true; sinUmbral++; }             // aún no hay ventana
      else { const s = [...hist].sort((a, b) => a - b); opera = v < s[Math.floor(s.length * q)]; }
      if (v != null && isFinite(v)) hist.push(v);
      if (!opera) fueraN++;
      pls.push(opera ? f.pl : 0);
    }
    const c = cartera(pls);
    control2.push({ id, nom, q, c, fueraN, sinUmbral });
    console.log("| " + id + " | `" + nom + "` | q" + (q * 100).toFixed(0) + " | " + fueraN + " (" + pct(fueraN / filas.length) + ") | " +
                eur(c.anual) + " | " + pct(c.anual / BASE.anual) + " | " + eur(c.peorDia) + " | " + eur(c.dd) + " | " +
                eur(c.dd - BASE.dd) + " | " + eur(c.p5) + " | " + eur(c.p1) + " | " + c.n2k + " | " + c.n4k + " |");
  }
}

// ═══ CONTROL 3 · AÑO A AÑO ══════════════════════════════════════════════════
console.log("\n## 3 · AÑO A AÑO (walk-forward q67) — racha e ingreso de cada año por separado\n");
const anos = [...new Set(filas.map((f) => f.fecha.slice(0, 4)))].sort();
console.log("| # | señal | " + anos.map((a) => a + " racha base→filtro").join(" | ") + " |");
console.log("|---|---|" + anos.map(() => "---|").join(""));
for (const [id, nom, fn] of CAND) {
  const hist = [], marca = new Map();
  for (const f of filas) {
    const v = fn(f);
    let opera = true;
    if (v != null && isFinite(v) && hist.length >= 120) { const s = [...hist].sort((a, b) => a - b); opera = v < s[Math.floor(s.length * (2 / 3))]; }
    if (v != null && isFinite(v)) hist.push(v);
    marca.set(f.fecha, opera);
  }
  const cel = [];
  for (const a of anos) {
    const sub = filas.filter((f) => f.fecha.slice(0, 4) === a);
    const b = cartera(sub.map((f) => f.pl), sub.length);
    const c = cartera(sub.map((f) => (marca.get(f.fecha) ? f.pl : 0)), sub.length);
    cel.push(eur(b.dd) + "→" + eur(c.dd) + " · ingreso " + pct(b.total ? c.total / b.total : 0));
  }
  console.log("| " + id + " | `" + nom + "` | " + cel.join(" | ") + " |");
}

// ═══ CONTROL 4 · MECANISMO ══════════════════════════════════════════════════
console.log("\n## 4 · MECANISMO — de dónde sale, y por qué el PEOR DÍA no se mueve\n");
const con = filas.filter((f) => f.vix != null && f.sigma > 0);
console.log("correlaciones (n=" + con.length + "):");
for (const [a, b] of [["vix", "credito"], ["vix", "mov"], ["vix", "sigma"], ["term9", "credito"], ["term9", "mov"], ["credito", "mov"]])
  console.log("  corr(" + a.padEnd(8) + ", " + b.padEnd(8) + ") = " + corr(con.map((f) => f[a]), con.map((f) => f[b])).toFixed(3));

console.log("\nLos 10 PEORES días — ¿son días de VIX alto o bajo?\n");
console.log("| fecha | P&L | crédito | VIX ayer | term9 | mov 11:00→cierre | σ esperada | ¿lo tira el filtro q67 de term9? |");
console.log("|---|---|---|---|---|---|---|---|");
const histT = []; const marcaT = new Map();
for (const f of filas) {
  const v = f.term9; let opera = true;
  if (v != null && isFinite(v) && histT.length >= 120) { const s = [...histT].sort((a, b) => a - b); opera = v < s[Math.floor(s.length * (2 / 3))]; }
  if (v != null && isFinite(v)) histT.push(v);
  marcaT.set(f.fecha, opera);
}
for (const f of [...filas].sort((a, b) => a.pl - b.pl).slice(0, 10))
  console.log("| " + f.fecha + " | " + eur(f.pl) + " | " + eur(f.credito) + " | " + (f.vix ?? "—") + " | " +
              (f.term9 ? f.term9.toFixed(3) : "—") + " | " + f.mov.toFixed(1) + " pts | " + (f.sigma ? f.sigma.toFixed(1) : "—") +
              " | " + (marcaT.get(f.fecha) ? "NO, opera" : "sí, fuera") + " |");

console.log("\nEl crédito manda en el TAMAÑO de la pérdida máxima: pérdida máx = (50 − crédito)×100.\n");
console.log("| tercio de crédito a las 11:00 | n | crédito medio | P&L medio | peor día | días <−$2k | días <−$4k | VIX medio de ayer |");
console.log("|---|---|---|---|---|---|---|---|");
const ordC = [...filas].sort((a, b) => b.credito - a.credito);
const kc = Math.floor(ordC.length / 3);
for (const [et, g] of [["ALTO", ordC.slice(0, kc)], ["MEDIO", ordC.slice(kc, 2 * kc)], ["BAJO", ordC.slice(-kc)]]) {
  const pls = g.map((f) => f.pl);
  console.log("| " + et + " | " + g.length + " | " + eur(media(g.map((f) => f.credito))) + " | " + eur(media(pls)) + " | " +
              eur(Math.min(...pls)) + " | " + pls.filter((x) => x < -MALO).length + " | " + pls.filter((x) => x < -MUYMALO).length +
              " | " + media(g.filter((f) => f.vix).map((f) => f.vix)).toFixed(1) + " |");
}

writeFileSync("scripts/cola-vix-control-salida.json", JSON.stringify({ base: BASE, control1, control2 }, null, 1), "utf8");
console.log("\n-> scripts/cola-vix-control-salida.json");
