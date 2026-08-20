// VENTANA CORTA · 3 — ¿el +1,93% del punto medio tras un ABOVE_ASK es SEÑAL o es la cotización
// poniéndose al día con un print que ya la había atravesado?
//
// ABOVE_ASK significa, por definición, price > ask_price. Si entro al ask MOSTRADO estoy usando
// una cotización que el propio print acaba de dejar obsoleta: nadie me vende ahí. El precio que
// de verdad habría que pagar para levantar esa oferta es el PRICE del print, no el ask viejo.
//
// Prueba: repetir la medición entrando a `price` en vez de a `ask_price`. Si el efecto se muere,
// era la cotización rezagada — el mismo error de "no cruzar series con etiquetas de tiempo".

import { diasFlujo, leerDia, parseOCC, eod, calendario, media, tUna, pct } from "./ventana-lib.mjs";
import { readdirSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const conCadena = new Set(readdirSync(CDIR).filter((f) => /_d\d{8}\.json$/.test(f)).map((f) => f.split("_d")[0]));
const cal = calendario();
const siguiente = (dc) => { const i = cal.indexOf(dc); return i >= 0 && i + 1 < cal.length ? cal[i + 1] : null; };

const filas = [];
for (const dia of diasFlujo("100k")) {
  const dc = dia.replace(/-/g, "");
  const dcSig = siguiente(dc);
  for (const o of leerDia(dia, "100k")) {
    const p = parseOCC(o.symbol);
    if (!p || !conCadena.has(p.raiz)) continue;
    const hhmm = o.timestamp.slice(11, 16);
    if (hhmm < "13:30" || hhmm > "19:30") continue;
    if (!(o.ask_price > 0) || !(o.bid_price > 0) || o.ask_price < o.bid_price || !(o.price > 0)) continue;
    const q = eod(p.raiz, dc, p.exp, p.tipo, p.strike);
    if (!q) continue;
    const qs = dcSig ? eod(p.raiz, dcSig, p.exp, p.tipo, p.strike) : null;
    filas.push({
      fecha: dia, ticker: p.raiz, hhmm, side: o.side, premium: o.premium,
      dte: Math.round((new Date(`${p.exp.slice(0, 4)}-${p.exp.slice(4, 6)}-${p.exp.slice(6, 8)}T00:00:00Z`) - new Date(`${dia}T00:00:00Z`)) / 864e5),
      ask: o.ask_price, bid: o.bid_price, price: o.price,
      sobreAsk: o.price / o.ask_price - 1,
      bidSal: q.bid, medioSal: q.ausente ? 0 : (q.bid + q.ask) / 2, medioEnt: (o.bid_price + o.ask_price) / 2,
      bidMan: qs ? qs.bid : null,
    });
  }
}
console.log(`\n## ¿Señal o cotización rezagada? · filas ${filas.length} · días ${new Set(filas.map((f) => f.fecha)).size}\n`);

const porDia = (g, fn) => {
  const m = new Map();
  for (const f of g) { if (!m.has(f.fecha)) m.set(f.fecha, []); m.get(f.fecha).push(fn(f)); }
  return [...m.entries()].sort().map(([, v]) => media(v.filter(Number.isFinite)));
};
const linea = (nom, g, fn) => {
  const v = g.map(fn).filter(Number.isFinite);
  const d = porDia(g, fn);
  console.log(`  ${nom.padEnd(38)} media ${(100 * media(v)).toFixed(2).padStart(7)}%  ·  mediana ${(100 * pct(v, 0.5)).toFixed(2).padStart(7)}%  ·  t por día (n=${d.length}) ${tUna(d).toFixed(2).padStart(6)}`);
};

for (const lado of ["ABOVE_ASK", "AT_ASK", "ASKSIDE", "MIDMKT", "BIDSIDE", "AT_BID", "BELOW_BID"]) {
  const g = filas.filter((f) => f.side === lado);
  if (g.length < 100) { console.log(`\n### ${lado} — sólo ${g.length} filas`); continue; }
  console.log(`\n### ${lado} · ${g.length} filas · ${new Set(g.map((f) => f.ticker)).size} tickers`);
  linea("price vs ask mostrado (el hueco)", g, (f) => f.sobreAsk);
  linea("mov. del punto medio hasta el cierre", g, (f) => f.medioSal / f.medioEnt - 1);
  linea("ENTRANDO AL ASK  → bid del cierre", g, (f) => f.bidSal / f.ask - 1);
  linea("ENTRANDO AL PRICE → bid del cierre", g, (f) => f.bidSal / f.price - 1);
  linea("ENTRANDO AL PRICE → bid de mañana", g.filter((f) => f.bidMan != null), (f) => f.bidMan / f.price - 1);
}

// ¿el movimiento del medio es sólo el hueco price-vs-ask?
console.log(`\n### El movimiento del medio contra el hueco, en el mismo ABOVE_ASK`);
const aa = filas.filter((f) => f.side === "ABOVE_ASK");
const mov = aa.map((f) => f.medioSal / f.medioEnt - 1), hueco = aa.map((f) => f.sobreAsk);
console.log(`  mov. medio ${(100 * media(mov)).toFixed(2)}%  ·  hueco price/ask−1 ${(100 * media(hueco)).toFixed(2)}%  ·  mov. NETO del hueco ${(100 * (media(mov) - media(hueco))).toFixed(2)}%`);
const netoD = porDia(aa, (f) => (f.medioSal / f.medioEnt - 1) - f.sobreAsk);
console.log(`  t por día del movimiento NETO (n=${netoD.length}): ${tUna(netoD).toFixed(2)}`);

// hora del día
console.log(`\n### ABOVE_ASK por hora de entrada (UTC) — ¿se acaba la persecución a los 30 min?`);
const bandas = [["13:30-14:00", "13:30", "14:00"], ["14:00-15:00", "14:00", "15:00"], ["15:00-16:30", "15:00", "16:30"], ["16:30-18:00", "16:30", "18:00"], ["18:00-19:30", "18:00", "19:30"]];
for (const [nom, a, b] of bandas) {
  const g = aa.filter((f) => f.hhmm >= a && f.hhmm < b);
  if (g.length < 50) { console.log(`  ${nom}: ${g.length} filas`); continue; }
  console.log(`  ${nom} · n=${String(g.length).padStart(5)} · medio ${(100 * media(g.map((f) => f.medioSal / f.medioEnt - 1))).toFixed(2).padStart(6)}% · al ASK ${(100 * media(g.map((f) => f.bidSal / f.ask - 1))).toFixed(2).padStart(6)}% · al PRICE ${(100 * media(g.map((f) => f.bidSal / f.price - 1))).toFixed(2).padStart(6)}%`);
}
