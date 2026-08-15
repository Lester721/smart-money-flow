// ¿Qué son las operaciones a las que no se les saca IV? Si son sistemáticamente de un tipo
// (muy dentro del dinero, casi vencidas…), descartarlas SESGA la muestra y hay que decirlo.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "scripts/cache-theta/flujo-historico";
const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "") + "/v3";
const MIN_PRIMA = 5_000_000, TOPE = 50;

const nd = (x) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p; };
const d1f = (S, K, T, v) => (Math.log(S / K) + (v * v / 2) * T) / (v * Math.sqrt(T));
const bsCall = (S, K, T, v) => S * nd(d1f(S, K, T, v)) - K * nd(d1f(S, K, T, v) - v * Math.sqrt(T));
const bsPut = (S, K, T, v) => bsCall(S, K, T, v) - S + K;
function ivDe(precio, S, K, T, esCall) {
  if (!(precio > 0) || !(S > 0) || !(K > 0) || !(T > 0)) return { iv: null, causa: "argumentos" };
  const intrin = esCall ? Math.max(0, S - K) : Math.max(0, K - S);
  if (precio < intrin) return { iv: null, causa: "precio POR DEBAJO del valor intrínseco" };
  let lo = 0.01, hi = 5;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    const v = esCall ? bsCall(S, K, T, m) : bsPut(S, K, T, m);
    if (v > precio) hi = m; else lo = m;
  }
  const iv = (lo + hi) / 2;
  if (iv <= 0.011) return { iv: null, causa: "toca el suelo (IV≈1%) — prima ≈ intrínseco" };
  if (iv >= 4.9) return { iv: null, causa: "toca el techo (IV≈500%)" };
  return { iv, causa: null };
}

const porTicker = {};
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  const d = JSON.parse(readFileSync(join(DIR, f), "utf8"));
  if (d.sinDatos) continue;
  const t = d.sym ?? f.split("_")[0];
  (porTicker[t] ??= []).push(...(d.notables ?? [])
    .filter((n) => n.prima >= MIN_PRIMA && n.bid != null && n.ask != null && n.oi != null)
    .map((n) => ({ ...n, ticker: t, dia: d.dia })));
}
const muestra = [];
for (const ops of Object.values(porTicker)) {
  ops.sort((a, b) => a.dia.localeCompare(b.dia) || a.ts.localeCompare(b.ts));
  const paso = ops.length / TOPE;
  for (let i = 0; i < TOPE; i++) muestra.push(ops[Math.floor(i * paso)]);
}

const cache = new Map();
async function spot(ticker, dia, ms) {
  const k = `${ticker}|${dia}`;
  if (!cache.has(k)) cache.set(k, (async () => {
    const r = await fetch(`${B}/stock/history/quote?symbol=${ticker}&start_date=${dia}&end_date=${dia}&interval=1m`,
      { signal: AbortSignal.timeout(45_000) });
    if (!r.ok) return null;
    const l = (await r.text()).trim().split("\n");
    const cab = l[0].split(","), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid"), iA = cab.indexOf("ask");
    const s = [];
    for (const x of l.slice(1)) { const f = x.split(",");
      const b = +f[iB], a = +f[iA]; if (b > 0 && a > 0) s.push([Date.parse(f[iT] + "Z"), (a + b) / 2]); }
    return s;
  })());
  const s = await cache.get(k);
  if (!s) return null;
  let lo = 0, hi = s.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (s[m][0] <= ms) { r = m; lo = m + 1; } else hi = m - 1; }
  return r < 0 ? null : s[r][1];
}

const causas = {}, cubos = {};
let ok = 0;
for (let i = 0; i < muestra.length; i += 4) {
  await Promise.all(muestra.slice(i, i + 4).map(async (n) => {
    const ms = Date.parse(n.ts + "Z");
    const S = await spot(n.ticker, n.dia, ms);
    if (!(S > 0)) { causas["sin subyacente"] = (causas["sin subyacente"] ?? 0) + 1; return; }
    const T = (Date.parse(`${n.exp}T20:00:00Z`) - ms) / (365 * 24 * 3600 * 1000);
    const esCall = n.right === "C";
    const { iv, causa } = ivDe(n.price, S, n.strike, T, esCall);
    if (iv != null) { ok++; return; }
    causas[causa] = (causas[causa] ?? 0) + 1;
    // ¿Dentro o fuera del dinero? Positivo = dentro.
    const m = esCall ? (S / n.strike - 1) : (n.strike / S - 1);
    const cubo = m > 0.15 ? "muy DENTRO (>15%)" : m > 0.05 ? "dentro 5-15%"
      : m > -0.05 ? "al dinero (±5%)" : "fuera del dinero";
    cubos[cubo] = (cubos[cubo] ?? 0) + 1;
  }));
}
console.log(`con IV: ${ok} de ${muestra.length}\n`);
console.log("por qué falla:"); for (const [k, v] of Object.entries(causas).sort((a,b)=>b[1]-a[1])) console.log(`  ${String(v).padStart(4)} · ${k}`);
console.log("\ndónde está el strike de las que fallan:");
for (const [k, v] of Object.entries(cubos).sort((a,b)=>b[1]-a[1])) console.log(`  ${String(v).padStart(4)} · ${k}`);
