// ¿EL +0,8% INTRADÍA ES SEÑAL O ES UN DESFASE ENTRE DOS FUENTES?
//
// El problema: medí la entrada con la cotización de MarketSnack y la salida con el cierre de
// ThetaData. Si las dos fuentes miden el punto medio distinto, aparece un sesgo constante que
// se lee como señal. La pista de que algo fallaba: las operaciones de los últimos 30 minutos
// también daban +0,39% — una opción no se mueve eso en media hora por causas de mercado.
//
// La prueba directa: pedirle a ThetaData la cotización DEL MISMO MINUTO de la operación y
// compararla con la que publica MarketSnack. Eso mide el desfase cara a cara, sin depender de
// ninguna teoría sobre por qué existe.
//
//   sesgo = (mid_ThetaData − mid_MarketSnack) / mid_MarketSnack
//
// Si el sesgo medio ronda +0,4%, el "hallazgo" era eso y no hay nada más que discutir.
// Si el sesgo es ~0, entonces el efecto intradía es real y hay que volver a mirarlo.
//
// Y de paso se calcula el rendimiento intradía con ThetaData EN LAS DOS PUNTAS, que es la
// medición limpia: misma fuente al entrar y al salir.
//
// Uso: node scripts/marketsnack/medir-sesgo-fuentes.mjs [muestra]

import fs from "node:fs";
import path from "node:path";
import rl from "node:readline";

const B = process.env.THETA_BASE || "http://127.0.0.1:25503/v3";
const DIRQ = "data/marketsnack/intradia";
const MUESTRA = Number(process.argv[2] || 2000);
const CONCURRENCIA = 4;
const COMPRA = new Set(["ASKSIDE", "ABOVE_ASK", "AT_ASK"]);
const P = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
fs.mkdirSync(DIRQ, { recursive: true });

// ── muestra estratificada por franja horaria ────────────────────────────────
// Estratificada y no aleatoria: el sesgo se delata en la franja de cierre, así que hace falta
// muestra suficiente en TODAS las franjas, no solo en las más pobladas.
const FRANJAS = [["09:30-10:30", 570, 630], ["10:30-12:00", 630, 720], ["12:00-14:00", 720, 840],
                 ["14:00-15:30", 840, 930], ["15:30-16:00", 930, 960]];
const cubos = new Map(FRANJAS.map(([f]) => [f, []]));

for await (const l of rl.createInterface({ input: fs.createReadStream("data/marketsnack/flujo-prima1000k.jsonl") })) {
  if (!l.trim()) continue;
  let t; try { t = JSON.parse(l); } catch { continue; }
  const m = P.exec(t.symbol ?? ""); if (!m) continue;
  if (!COMPRA.has(t.side) || (t.score ?? 0) < 70) continue;
  if (!(t.ask_price > 0) || !(t.bid_price > 0)) continue;
  const min = (+t.timestamp.slice(11, 13) - 4) * 60 + +t.timestamp.slice(14, 16);   // UTC -> ET
  const fr = FRANJAS.find(([, a, b]) => min >= a && min < b); if (!fr) continue;
  cubos.get(fr[0]).push({
    raiz: m[1], venc: `20${m[2].slice(0, 2)}-${m[2].slice(2, 4)}-${m[2].slice(4, 6)}`,
    strike: +m[4] / 1000, right: m[3], dia: t.timestamp.slice(0, 10),
    // ⚠️ MarketSnack marca en UTC y ThetaData en hora del ESTE. Si se busca el minuto sin
    // convertir, se compara la operación con la cotización de cuatro horas después y sale una
    // "señal" que es pura deriva. Ya me pasó: las franjas de tarde salían con 0 datos porque
    // el hhmm en UTC se salía del horario de mercado en ET.
    hhmm: `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`,
    franja: fr[0],
    midMS: (t.ask_price + t.bid_price) / 2,
  });
}

// Reparto uniforme entre franjas, tomando uno de cada N para no coger sólo un tramo de fechas.
const porFranja = Math.floor(MUESTRA / FRANJAS.length);
const sel = [];
for (const [f, arr] of cubos) {
  const paso = Math.max(1, Math.floor(arr.length / porFranja));
  for (let i = 0; i < arr.length && sel.filter((x) => x.franja === f).length < porFranja; i += paso) sel.push(arr[i]);
}
console.log(`═══ SESGO ENTRE FUENTES · MarketSnack contra ThetaData ═══\n`);
for (const [f, arr] of cubos) console.log(`   ${f}: ${arr.length} disponibles → ${sel.filter((x) => x.franja === f).length} en la muestra`);
console.log(`\n   total a pedir: ${sel.length}  ·  ~${Math.round(sel.length * 1.2 / CONCURRENCIA / 60)} min\n`);

// ── bajar la cotización del minuto ──────────────────────────────────────────
const fich = (o) => path.join(DIRQ, `${o.raiz}_${o.venc.replaceAll("-", "")}_${o.strike}_${o.right}_${o.dia.replaceAll("-", "")}.json`);

async function bajar(o) {
  const f = fich(o);
  if (fs.existsSync(f)) return "cache";
  try {
    const r = await fetch(`${B}/option/history/quote?symbol=${o.raiz}&expiration=${o.venc}&strike=${o.strike}&right=${o.right}&start_date=${o.dia}&end_date=${o.dia}&interval=1m`,
                          { signal: AbortSignal.timeout(60000) });
    const txt = await r.text();
    if (!r.ok || !txt.includes("bid")) return "fallo";
    const lin = txt.trim().split("\n"), cab = lin[0].split(",");
    const iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid"), iA = cab.indexOf("ask");
    const mapa = {};
    for (const l of lin.slice(1)) {
      const c = l.split(",");
      const hhmm = (c[iT] ?? "").slice(11, 16);
      const bid = +c[iB], ask = +c[iA];
      if (!/^\d{2}:\d{2}$/.test(hhmm) || !(bid > 0) || !(ask > 0)) continue;
      mapa[hhmm] = [bid, ask];
    }
    if (!Object.keys(mapa).length) return "vacio";
    fs.writeFileSync(f, JSON.stringify(mapa));
    return "ok";
  } catch { return "fallo"; }
}

const cuenta = { ok: 0, cache: 0, vacio: 0, fallo: 0 };
let idx = 0; const t0 = Date.now();
async function trabajador() {
  while (idx < sel.length) {
    const o = sel[idx++];
    cuenta[await bajar(o)]++;
    const h = cuenta.ok + cuenta.cache + cuenta.vacio + cuenta.fallo;
    if (h % 100 === 0) process.stdout.write(`\r   ${h}/${sel.length}  ·  ok ${cuenta.ok + cuenta.cache}  vacíos ${cuenta.vacio}  fallos ${cuenta.fallo}  ·  ${((Date.now() - t0) / 60000).toFixed(1)} min   `);
  }
}
await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));
console.log(`\r   ${sel.length}/${sel.length}  ·  ok ${cuenta.ok + cuenta.cache}  ·  vacíos ${cuenta.vacio}  ·  fallos ${cuenta.fallo}  ·  ${((Date.now() - t0) / 60000).toFixed(1)} min      \n`);

// ── medir ───────────────────────────────────────────────────────────────────
const med = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const dev = (a) => { const m = med(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const tt = (a) => med(a) / (dev(a) / Math.sqrt(a.length));
const mdn = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const cerrar = (mapa) => { const hs = Object.keys(mapa).filter((h) => h <= "16:00").sort(); return hs.length ? mapa[hs[hs.length - 1]] : null; };

const sesgo = {}, limpio = {};
for (const [f] of FRANJAS) { sesgo[f] = []; limpio[f] = []; }

for (const o of sel) {
  let mapa; try { mapa = JSON.parse(fs.readFileSync(fich(o), "utf8")); } catch { continue; }
  const q = mapa[o.hhmm]; if (!q) continue;
  const midTD = (q[0] + q[1]) / 2;
  if (!(midTD > 0) || !(o.midMS > 0)) continue;
  sesgo[o.franja].push((midTD - o.midMS) / o.midMS * 100);
  const c = cerrar(mapa);
  if (c) { const midC = (c[0] + c[1]) / 2; if (midC > 0) limpio[o.franja].push((midC - midTD) / midTD * 100); }
}

console.log(`${"─".repeat(72)}`);
console.log(`1) EL SESGO — cotización de ThetaData contra la de MarketSnack, MISMO MINUTO\n`);
console.log(`   franja           n     sesgo medio   mediana        t`);
const todos = [];
for (const [f] of FRANJAS) { const a = sesgo[f]; if (a.length < 20) { console.log(`   ${f}  ${String(a.length).padStart(6)}   muestra corta`); continue; }
  todos.push(...a);
  console.log(`   ${f}  ${String(a.length).padStart(6)}   ${(med(a) >= 0 ? "+" : "") + med(a).toFixed(3).padStart(8)}%  ${(mdn(a) >= 0 ? "+" : "") + mdn(a).toFixed(3).padStart(8)}%  ${tt(a).toFixed(2).padStart(7)}`); }
if (todos.length > 20) console.log(`   ${"TOTAL".padEnd(11)}  ${String(todos.length).padStart(6)}   ${(med(todos) >= 0 ? "+" : "") + med(todos).toFixed(3).padStart(8)}%  ${(mdn(todos) >= 0 ? "+" : "") + mdn(todos).toFixed(3).padStart(8)}%  ${tt(todos).toFixed(2).padStart(7)}`);

console.log(`\n2) LA MEDICIÓN LIMPIA — ThetaData en las DOS puntas, del minuto de la alerta al cierre\n`);
console.log(`   franja           n     rendimiento        t`);
const limpTodos = [];
for (const [f] of FRANJAS) { const a = limpio[f]; if (a.length < 20) { console.log(`   ${f}  ${String(a.length).padStart(6)}   muestra corta`); continue; }
  limpTodos.push(...a);
  console.log(`   ${f}  ${String(a.length).padStart(6)}   ${(med(a) >= 0 ? "+" : "") + med(a).toFixed(3).padStart(8)}%  ${tt(a).toFixed(2).padStart(7)}`); }
if (limpTodos.length > 20) console.log(`   ${"TOTAL".padEnd(11)}  ${String(limpTodos.length).padStart(6)}   ${(med(limpTodos) >= 0 ? "+" : "") + med(limpTodos).toFixed(3).padStart(8)}%  ${tt(limpTodos).toFixed(2).padStart(7)}`);

console.log(`\n   Cómo leerlo:`);
console.log(`   · Si el sesgo (1) ronda el +0,4% y el limpio (2) sale ~0 -> era el desfase de fuentes.`);
console.log(`   · Si el sesgo (1) es ~0 y el limpio (2) mantiene el +0,8% -> el efecto es REAL y`);
console.log(`     hay que volver a mirarlo en serio, aunque siga sin cubrir la horquilla.`);
console.log(`   · La horquilla de estas opciones es 1,81% de mediana: ese es el listón a batir.\n`);
