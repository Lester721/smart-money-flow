// PASO 6 — EL DINERO, a un tamano que la cuenta aguante, y la peor racha.
import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos.ts";

const ops = JSON.parse(readFileSync("scripts/cache-theta/marketsnack/ops-comprar.json", "utf8"));
const CUENTA = 56389, DIAS_MUESTRA = 73, DIAS_ANO = 252;
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (x) => (x * 100).toFixed(2) + "%";

console.log(`\nPRUEBAS REALMENTE HECHAS EN ESTE ENCARGO:`);
const cuentas = { "lado directo (3x4x4)": 48, "lado con compuerta": 48, "cono base": 48, "cono compuerta GLOBAL/TICKER/DIA": 144, "tamano del movimiento": 8, "movimiento vs punto muerto": 8, "potencia": 12 };
let T = 0; for (const [k, v] of Object.entries(cuentas)) { T += v; console.log(`  ${k.padEnd(38)} ${String(v).padStart(4)}`); }
console.log(`  ${"TOTAL".padEnd(38)} ${String(T).padStart(4)}   ->  liston Bonferroni |t| >= ${listonT(T)}`);

// ── la celda que MAS paga de la senal direccional, y la misma a tamano de cuenta ──
console.log(`\n\nLA MEJOR CELDA DE LA SENAL DEL LADO, EN DINERO (cuenta $${CUENTA})\n`);
const filasDe = (plazo, dist, h) => ops.filter((o) => o.plazo === plazo && o.dist === dist && o.h === h && o.neto !== 0)
  .map((o) => { const al = o.neto > 0; return { ticker: o.ticker, fecha: o.fecha, ask: al ? o.askC : o.askP, sal: al ? o.salC : o.salP,
    ret: al ? o.retC : o.retP, azar: (o.retC + o.retP) / 2 }; });

for (const [plazo, dist, h] of [[60, 0.05, 20], [60, 0, 20], [60, 0, 1], [30, 0, 1]]) {
  const f = filasDe(plazo, dist, h);
  const primaM = media(f.map((x) => x.ask)) * 100;
  const rM = media(f.map((x) => x.ret));
  const dias = [...new Set(f.map((x) => x.fecha))].sort();
  const simult = Math.max(1, Math.round((f.length / dias.length) * h));      // contratos abiertos a la vez
  const capital = primaM * simult;
  const escala = Math.min(1, CUENTA / capital);
  const opsAno = (f.length / DIAS_MUESTRA) * DIAS_ANO;
  const anoPleno = primaM * rM * opsAno;
  console.log(`plazo ${plazo}d · ${dist * 100}% fuera · salida ${h}d`);
  console.log(`  n=${f.length} · ret medio/op ${pct(rM)} · prima media $${primaM.toFixed(0)} · aciertos ${pct(f.filter((x) => x.sal > x.ask).length / f.length)}`);
  console.log(`  a tamano PLENO: ${simult} contratos a la vez = $${capital.toFixed(0)} comprometidos -> $${anoPleno.toFixed(0)}/ano`);
  console.log(`  la cuenta solo aguanta el ${(escala * 100).toFixed(1)}% de eso -> $${(anoPleno * escala).toFixed(0)}/ano sobre $${CUENTA}`);
  // peor racha: P&L acumulado por dia de entrada, un contrato por senal, escalado a la cuenta
  const porDia = new Map();
  for (const x of f) porDia.set(x.fecha, (porDia.get(x.fecha) ?? 0) + (x.sal - x.ask) * 100 * escala);
  let acum = 0, pico = 0, peor = 0, rachaN = 0, peorN = 0;
  for (const d of dias) { const v = porDia.get(d) ?? 0; acum += v; pico = Math.max(pico, acum); peor = Math.min(peor, acum - pico);
    if (v < 0) { rachaN++; peorN = Math.max(peorN, rachaN); } else rachaN = 0; }
  console.log(`  resultado total en los 73 dias: $${acum.toFixed(0)} · peor caida desde maximo: $${peor.toFixed(0)} · peor racha ${peorN} dias seguidos en rojo\n`);
}

// ── el vehiculo, resumido: que pasa si compras y ya esta ──
console.log(`\nEL VEHICULO A SECAS (comprar al azar, sin ninguna senal) — las 48 celdas\n`);
const todas = [];
for (const plazo of [7, 30, 60]) for (const dist of [0, 0.05, 0.10, 0.20]) for (const h of [1, 5, 10, 20]) {
  const g = ops.filter((o) => o.plazo === plazo && o.dist === dist && o.h === h);
  if (g.length < 30) continue;
  const rets = g.flatMap((o) => [o.retC, o.retP]);
  const cero = g.flatMap((o) => [o.salC, o.salP]).filter((v) => v <= 0.001).length;
  todas.push({ plazo, dist, h, r: media(rets), cero: cero / (g.length * 2), n: g.length * 2 });
}
console.log(`  celdas medidas: ${todas.length} · con retorno medio POSITIVO: ${todas.filter((x) => x.r > 0).length}`);
const mejor = todas.slice().sort((a, b) => b.r - a.r)[0], peorC = todas.slice().sort((a, b) => a.r - b.r)[0];
console.log(`  la mejor: ${mejor.plazo}d ${mejor.dist * 100}% salida ${mejor.h}d -> ${pct(mejor.r)} (${pct(mejor.cero)} expiran sin valor)`);
console.log(`  la peor : ${peorC.plazo}d ${peorC.dist * 100}% salida ${peorC.h}d -> ${pct(peorC.r)} (${pct(peorC.cero)} expiran sin valor)`);
console.log(`  media de las 48: ${pct(media(todas.map((x) => x.r)))}`);
