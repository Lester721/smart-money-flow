// DIAGNÓSTICO (no es una prueba nueva: es mirar la MISMA separación con más resolución).
//
// A +1 día es donde hay más muestra (81 días) y donde las cuatro métricas coinciden en SIGNO,
// que además es el signo que predice el mecanismo (dealer corto de delta -> compra -> sube).
// La pregunta que decide si esto es un rastro o es ruido: ¿la relación es MONÓTONA por quintiles,
// o el "tercio alto menos bajo" lo está fabricando un extremo suelto?
//
// Un quintil monótono con t bajo es una señal a la que le falta muestra.
// Un quintil desordenado con t bajo es ruido. No es lo mismo y no se puede reportar igual.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const DIR_FLUJO = "scripts/cache-theta/marketsnack/flujo-100k";
const DIR_CHART = "scripts/cache-theta/marketsnack/aux/chart-all";
const RE = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
const COMPRA = new Set(["ASKSIDE", "ABOVE_ASK", "AT_ASK"]), VENTA = new Set(["BIDSIDE", "BELOW_BID", "AT_BID"]);
const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const desv = (a) => { if (a.length < 2) return 0; const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const t1 = (a) => (a.length < 3 || desv(a) === 0 ? 0 : media(a) / (desv(a) / Math.sqrt(a.length)));

const cierres = new Map(), idxF = new Map();
for (const f of fs.readdirSync(DIR_CHART)) {
  const T = f.replace(".json.gz", "");
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR_CHART, f))).toString("utf8"));
  const s = (j.data || []).map((p) => ({ f: p.t.slice(0, 10), c: p.v })).filter((p) => p.c > 0).sort((a, b) => a.f.localeCompare(b.f)).filter((p) => p.f < "2026-08-19");
  if (s.length < 30) continue;
  for (let i = 1; i < s.length; i++) if (Math.abs(s[i].c / s[i - 1].c - 1) > 0.25) s[i].salto = true;
  cierres.set(T, s); idxF.set(T, new Map(s.map((p, i) => [p.f, i])));
}
const dias = fs.readdirSync(DIR_FLUJO).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();
const agg = new Map(), primaTot = new Map();
for (const d of dias) {
  for (const l of zlib.gunzipSync(fs.readFileSync(path.join(DIR_FLUJO, `${d}.jsonl.gz`))).toString("utf8").split("\n")) {
    if (!l) continue;
    let t; try { t = JSON.parse(l); } catch { continue; }
    if (!t.timestamp || t.timestamp.slice(11, 16) >= "19:00") continue;
    const m = RE.exec(t.symbol || ""); if (!m) continue;
    const raiz = m[1], ser = cierres.get(raiz); if (!ser) continue;
    const k = `${raiz}|${d}`;
    primaTot.set(k, (primaTot.get(k) ?? 0) + (t.premium > 0 ? t.premium : 0));
    if (!Number.isFinite(t.delta) || !Number.isFinite(t.gamma) || !(t.size > 0)) continue;
    const sgn = COMPRA.has(t.side) ? -1 : VENTA.has(t.side) ? 1 : 0; if (!sgn) continue;
    if (!(t.ask_price > 0) || t.bid_price > t.ask_price) continue;
    const i = idxF.get(raiz).get(d); if (i == null || i < 1) continue;
    const S = ser[i - 1].c, ct = t.size * 100;
    let a = agg.get(k);
    if (!a) { a = { raiz, dia: d, dd: 0, dg: 0, absd: 0, absg: 0, n: 0, prima: 0 }; agg.set(k, a); }
    a.dd += sgn * t.delta * ct * S; a.dg += sgn * t.gamma * ct * S * S * 0.01;
    a.absd += Math.abs(t.delta) * ct * S; a.absg += t.gamma * ct * S * S * 0.01;
    a.n++; a.prima += t.premium > 0 ? t.premium : 0;
  }
}
const sd = [...agg.values()].filter((a) => a.n >= 8 && a.prima / (primaTot.get(`${a.raiz}|${a.dia}`) || 1) >= 0.6);
for (const a of sd) {
  a.iDelta = a.absd > 0 ? a.dd / a.absd : null;
  a.iGamma = a.absg > 0 ? a.dg / a.absg : null;
  const ser = cierres.get(a.raiz), i = idxF.get(a.raiz).get(a.dia);
  if (i != null && i + 1 < ser.length && !ser[i + 1].salto) a.r1 = (ser[i + 1].c / ser[i].c - 1) * 100;
}
const porDia = new Map();
for (const a of sd) { if (a.r1 == null) continue; if (!porDia.has(a.dia)) porDia.set(a.dia, []); porDia.get(a.dia).push(a); }

console.log("QUINTILES TRANSVERSALES A +1 DÍA — rendimiento en exceso sobre la media del día\n");
console.log("El mecanismo predice una PENDIENTE NEGATIVA: menos delta$/gamma$ del dealer -> más sube.\n");
for (const met of ["iDelta", "iGamma"]) {
  const series = [[], [], [], [], []];
  let nd = 0;
  for (const [, arr] of porDia) {
    const con = arr.filter((a) => a[met] != null && Number.isFinite(a[met]));
    if (con.length < 20) continue;
    nd++;
    con.sort((x, y) => x[met] - y[met]);
    const mu = media(con.map((a) => a.r1));
    const k = Math.floor(con.length / 5);
    for (let q = 0; q < 5; q++) {
      const g = q === 4 ? con.slice(4 * k) : con.slice(q * k, (q + 1) * k);
      series[q].push(media(g.map((a) => a.r1)) - mu);
    }
  }
  console.log(`${met}  ·  ${nd} días`);
  const m = series.map((s) => media(s));
  for (let q = 0; q < 5; q++) {
    const barra = "█".repeat(Math.max(0, Math.round(Math.abs(m[q]) * 40)));
    console.log(`  Q${q + 1} (${q === 0 ? "dealer más CORTO " : q === 4 ? "dealer más LARGO " : "                 "})  ${(m[q] >= 0 ? "+" : "−") + Math.abs(m[q]).toFixed(4)}%   t=${t1(series[q]).toFixed(2).padStart(5)}   ${barra}`);
  }
  const monoBaja = m.every((x, i) => i === 0 || x <= m[i - 1]);
  const monoSube = m.every((x, i) => i === 0 || x >= m[i - 1]);
  const dif = series[4].map((x, i) => x - series[0][i]);
  console.log(`  Q5 − Q1 = ${(media(dif) >= 0 ? "+" : "−") + Math.abs(media(dif)).toFixed(4)}%  ·  t = ${t1(dif).toFixed(2)}  ·  monótona: ${monoBaja ? "SÍ (bajando, como predice el mecanismo)" : monoSube ? "SÍ (subiendo, AL REVÉS del mecanismo)" : "NO"}`);
  console.log(`  orden observado: ${m.map((x, i) => `Q${i + 1}`).sort((a, b) => m[+a[1] - 1] - m[+b[1] - 1]).join(" < ")}\n`);
}
