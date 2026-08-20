// ═══ CONVEXIDAD · PASO 5 — AUTOPSIA Y EL TEST DE LA AMPLITUD ════════════════════════════
//
// El paso 4 no dio "nada": dio que la elección de MS queda en el percentil 4 del azar, o sea
// PEOR que elegir a ciegas en 41 de 44 pruebas. Eso hay que explicarlo antes de reportarlo,
// porque tiene dos explicaciones muy distintas:
//
//   (1) EL PEAJE — MS marca los contratos más caros y de horquilla más ancha. Entonces no es
//       que elija mal el ticker: es que elige el mismo ticker por una puerta más cara. Ya pasó
//       en este proyecto ("la horquilla es un % de la prima").
//   (2) LA SEÑAL VA AL REVÉS — el ticker con el flujo de calls más alcista rinde MENOS el mes
//       siguiente. Si fuera esto, los tercios serían MONÓTONOS y el tercio bajo saldría bien.
//
// Y falta LA PREGUNTA DE LESTER, que el paso 4 todavía no contesta. Comprar una opción no es
// acertar la dirección: es acertar el TAMAÑO. Una señal que no sirve para el retorno de la
// acción puede servir para opciones si lo que marca son MOVIMIENTOS GRANDES. Aquí se mide:
// ¿los tickers que MS marca se mueven MÁS (en valor absoluto) que los que no marca?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/convex-5-autopsia.mjs

import fs from "node:fs";
import path from "node:path";
import { listonT } from "../../lib/barreraHallazgos.ts";

const filas = JSON.parse(fs.readFileSync(path.join("scripts", "marketsnack", "convex-3-tabla.json"), "utf8"));
const CIE = path.join("scripts", "cache-theta", "cierres");
const CAD = path.join("scripts", "cache-theta", "cadenas");
const SORTEOS = 500;
let semilla = 20260820;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
const media = (v) => v.reduce((s, x) => s + x, 0) / v.length;

// calendario
const porTicker = new Map();
for (const f of fs.readdirSync(CAD)) { const m = f.match(/^([A-Z]+)_d(2026\d{4})\.json$/); if (!m) continue;
  if (!porTicker.has(m[1])) porTicker.set(m[1], []); porTicker.get(m[1]).push(m[2]); }
for (const v of porTicker.values()) v.sort();
const CAL = porTicker.get("SPY");
const idx = new Map(CAL.map((d, i) => [d, i]));
const cierres = {};
for (const t of porTicker.keys()) cierres[t] = JSON.parse(fs.readFileSync(path.join(CIE, `${t}.json`), "utf8"));

/** t y n efectiva, con la n efectiva ACOTADA a la muestra: una serie de 54 días no puede
 *  contener 300 apuestas independientes por mucho que lo diga el estimador. */
function neweyWest(serie, H) {
  const n = serie.length, m = media(serie);
  const dev = serie.map((x) => x - m);
  const g0 = dev.reduce((s, x) => s + x * x, 0) / n;
  if (!(g0 > 0)) return { m, t: 0, nEf: n };
  let S = g0; const L = Math.max(0, H - 1);
  for (let k = 1; k <= L && k < n; k++) {
    let gk = 0; for (let i = k; i < n; i++) gk += dev[i] * dev[i - k];
    S += 2 * (1 - k / (L + 1)) * (gk / n);
  }
  if (!(S > 0)) S = g0;
  return { m, t: m / Math.sqrt(S / n), nEf: Math.min(n, n * g0 / S) };
}

// ── movimiento del subyacente hasta H (para el test de amplitud) ──────────────────────────
for (const f of filas) {
  const i0 = idx.get(f.dia);
  for (const H of [5, 10, 20, 40]) {
    const i1 = i0 + H;
    if (i1 >= CAL.length) { f[`m${H}`] = null; f[`a${H}`] = null; continue; }
    const a = cierres[f.ticker][f.dia], b = cierres[f.ticker][CAL[i1]];
    if (!(a > 0) || !(b > 0)) { f[`m${H}`] = null; f[`a${H}`] = null; continue; }
    f[`m${H}`] = Math.log(b / a);            // movimiento CON signo
    f[`a${H}`] = Math.abs(Math.log(b / a));  // AMPLITUD, sin signo — lo que paga la convexidad
  }
}

const C = filas.filter((f) => f.tipo === "C");
const H = 20, rk = "r20";

// ═══ 1. AUTOPSIA DEL PRE-REGISTRADO ══════════════════════════════════════════════════════
console.log(`\n═══ 1 · ¿POR QUÉ LA ELECCIÓN DE MS PIERDE CONTRA EL AZAR? ═══`);
const val = C.filter((f) => f[rk] != null && f.s1 != null);
const porDia = new Map();
for (const f of val) { if (!porDia.has(f.dia)) porDia.set(f.dia, []); porDia.get(f.dia).push(f); }
const dias = [...porDia.keys()].sort().filter((d) => porDia.get(d).length >= 5);
const elegidos = [], todos = [];
for (const d of dias) {
  const c = [...porDia.get(d)].sort((a, b) => b.s1 - a.s1);
  elegidos.push(...c.slice(0, 3)); todos.push(...c);
}
const cmp = (campo, esc = 1, suf = "") => {
  const e = media(elegidos.map((x) => x[campo])) * esc, t = media(todos.map((x) => x[campo])) * esc;
  console.log(`   ${campo.padEnd(14)} MS ${e.toFixed(2).padStart(8)}${suf}   todos ${t.toFixed(2).padStart(8)}${suf}   dif ${(e - t).toFixed(2).padStart(7)}${suf}`);
};
console.log(`   (top-3 por lado de calls, ${dias.length} días, ${elegidos.length} operaciones)`);
cmp("horquilla", 100, "%");
cmp("ask", 100, "$");
cmp("moneyness");
cmp("sigmasReales");
cmp("rv60", 100, "%");
cmp("nCall");
cmp("r20", 100, "%");
cmp("m20", 100, "%");
cmp("a20", 100, "%");
const cnt = new Map();
for (const e of elegidos) cnt.set(e.ticker, (cnt.get(e.ticker) ?? 0) + 1);
console.log(`\n   a quién elige: ${[...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, n]) => `${t}:${n}`).join(" ")}`);
console.log(`   tickers distintos elegidos: ${cnt.size} de ${new Set(todos.map((x) => x.ticker)).size} disponibles`);

// ¿el peaje explica la diferencia? retorno "sin peaje" = punto medio a punto medio
// (NO ES OPERABLE — sólo sirve para saber cuánto de la pérdida es la horquilla)
console.log(`\n   descomposición de la pérdida (el punto medio NO es operable, sólo diagnostica):`);
const conMid = [];
const cacheC = new Map();
const leerCad = (t, d) => { const k = `${t}|${d}`; if (cacheC.has(k)) return cacheC.get(k);
  let j = null; try { j = JSON.parse(fs.readFileSync(path.join(CAD, `${t}_d${d}.json`), "utf8")); } catch {}
  cacheC.set(k, j); return j; };
for (const grupo of [["MS", elegidos], ["todos", todos]]) {
  const rs = [];
  for (const f of grupo[1]) {
    const i1 = idx.get(f.dia) + H; if (i1 >= CAL.length) continue;
    const jd = leerCad(f.ticker, CAL[i1]);
    const q = jd?.[f.exp]?.[`${f.K}|C`];
    const midEnt = (f.ask + f.bid) / 2;
    const midSal = q ? (q[0] + q[1]) / 2 : 0;
    rs.push(midSal / midEnt - 1);
  }
  conMid.push({ g: grupo[0], r: media(rs) });
}
console.log(`      real (ask→bid) : MS ${(media(elegidos.map(x => x[rk])) * 100).toFixed(1)}%   todos ${(media(todos.map(x => x[rk])) * 100).toFixed(1)}%`);
console.log(`      medio→medio    : MS ${(conMid[0].r * 100).toFixed(1)}%   todos ${(conMid[1].r * 100).toFixed(1)}%`);
console.log(`      → el peaje cuesta: MS ${((media(elegidos.map(x => x[rk])) - conMid[0].r) * 100).toFixed(1)} pts · todos ${((media(todos.map(x => x[rk])) - conMid[1].r) * 100).toFixed(1)} pts`);

// ═══ 2. MONOTONÍA POR TERCIOS — ¿va al revés de verdad? ═════════════════════════════════
console.log(`\n═══ 2 · TERCIOS DE LA SEÑAL (dentro de cada día) ═══`);
console.log(`   si la señal fuera contraria de verdad, los tercios serían monótonos.`);
for (const sen of ["s1", "s2", "s3"]) {
  for (const campo of ["r20", "m20", "a20"]) {
    const buckets = [[], [], []];
    for (const d of dias) {
      const c = porDia.get(d).filter((x) => x[sen] != null && x[campo] != null);
      if (c.length < 6) continue;
      const s = [...c].sort((a, b) => a[sen] - b[sen]);
      const n3 = Math.floor(s.length / 3);
      buckets[0].push(...s.slice(0, n3));
      buckets[1].push(...s.slice(n3, s.length - n3));
      buckets[2].push(...s.slice(s.length - n3));
    }
    if (buckets.some((b) => b.length < 30)) continue;
    const m = buckets.map((b) => media(b.map((x) => x[campo])) * 100);
    const mono = (m[0] < m[1] && m[1] < m[2]) || (m[0] > m[1] && m[1] > m[2]);
    console.log(`   ${sen} → ${campo.padEnd(4)}  bajo ${m[0].toFixed(1).padStart(7)}%  medio ${m[1].toFixed(1).padStart(7)}%  alto ${m[2].toFixed(1).padStart(7)}%   ${mono ? "MONÓTONO" : "no monótono"}  (n ${buckets.map(b => b.length).join("/")})`);
  }
}

// ═══ 3. EL TEST QUE PIDE LESTER: ¿PREDICE MOVIMIENTOS GRANDES? ══════════════════════════
console.log(`\n═══ 3 · ¿MARCA MS LOS MOVIMIENTOS GRANDES? (amplitud |movimiento|, sin signo) ═══`);
console.log(`   ésta es la pregunta que separa "operar la acción" de "comprar una opción".`);
console.log(`   nulo = 500 sorteos entre los MISMOS candidatos del MISMO día.\n`);
const LISTON = listonT(56);
console.log(`   señal H  K | días  bloques  nEf |  |mov| MS   azar   exceso |   t     %A`);
console.log(`   ` + "─".repeat(78));
const ampl = [];
for (const sen of ["s1", "s2", "s3"]) {
  for (const Hh of [5, 10, 20, 40]) {
    const ak = `a${Hh}`;
    const v = C.filter((f) => f[ak] != null && f[sen] != null);
    const pd = new Map();
    for (const f of v) { if (!pd.has(f.dia)) pd.set(f.dia, []); pd.get(f.dia).push(f); }
    for (const K of [1, 3]) {
      const ds = [...pd.keys()].sort().filter((d) => pd.get(d).length >= K + 2);
      if (ds.length < 20) continue;
      const serie = [], ele = [];
      for (const d of ds) {
        const c = [...pd.get(d)].sort((a, b) => Math.abs(b[sen]) - Math.abs(a[sen]));  // MÁS señal, en valor absoluto
        const pick = c.slice(0, K); ele.push(...pick);
        serie.push(media(pick.map((x) => x[ak])) - media(c.map((x) => x[ak])));
      }
      const R = media(ele.map((x) => x[ak]));
      const nul = [];
      for (let s = 0; s < SORTEOS; s++) {
        const q = [];
        for (const d of ds) { const c = pd.get(d), is = new Set();
          while (is.size < K) is.add(Math.floor(rnd() * c.length));
          q.push(media([...is].map((i) => c[i][ak]))); }
        nul.push(media(q));
      }
      nul.sort((a, b) => a - b);
      const pctA = nul.filter((x) => x < R).length / SORTEOS;
      const nw = neweyWest(serie, Hh);
      ampl.push({ sen, H: Hh, K, ds: ds.length, R, nul: media(nul), t: nw.t, pctA, nEf: nw.nEf });
      console.log(`   ${sen}   ${String(Hh).padStart(2)} ${K} | ${String(ds.length).padStart(3)}   ${String(Math.floor(ds.length / Hh)).padStart(4)}   ${nw.nEf.toFixed(1).padStart(4)} | ${(R * 100).toFixed(2).padStart(7)}% ${(media(nul) * 100).toFixed(2).padStart(6)}% ${((R - media(nul)) * 100).toFixed(2).padStart(7)}% | ${nw.t.toFixed(2).padStart(5)} ${(pctA * 100).toFixed(0).padStart(6)}`);
    }
  }
}
const ganan = ampl.filter((a) => a.pctA > 0.95);
console.log(`\n   pasan el sorteo (pct>95): ${ganan.length} de ${ampl.length} · esperadas por azar ${(ampl.length * 0.05).toFixed(1)}`);
console.log(`   pasan el listón t=${LISTON}: ${ampl.filter((a) => a.t > LISTON).length}`);
const ord = [...ampl].sort((a, b) => a.pctA - b.pctA);
console.log(`   percentil: mediana ${(ord[Math.floor(ampl.length / 2)].pctA * 100).toFixed(0)} · min ${(ord[0].pctA * 100).toFixed(0)} · max ${(ord[ampl.length - 1].pctA * 100).toFixed(0)}`);

// ═══ 4. LA n QUE MANDA ══════════════════════════════════════════════════════════════════
console.log(`\n═══ 4 · CUÁNTAS APUESTAS INDEPENDIENTES HAY DE VERDAD ═══`);
for (const Hh of [5, 10, 20, 40]) {
  const v = C.filter((f) => f[`r${Hh}`] != null);
  const ds = new Set(v.map((f) => f.dia)).size;
  console.log(`   H=${String(Hh).padStart(2)}: ${String(v.length).padStart(4)} filas · ${String(ds).padStart(2)} días de entrada · ${Math.floor(ds / Hh)} bloques SIN SOLAPE`);
}
console.log(`\n   Con 74 días de flujo útiles y un mes de plazo, el número de apuestas`);
console.log(`   verdaderamente independientes es 2. No hay forma de subirlo con estos datos.`);

fs.writeFileSync(path.join("scripts", "marketsnack", "convex-5-salida.json"), JSON.stringify({ ampl }), "utf8");
console.log(`\n## guardado en scripts/marketsnack/convex-5-salida.json`);
