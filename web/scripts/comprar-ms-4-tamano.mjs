// PASO 4 — EL PUENTE. El paso 2 dice que el LADO del flujo no vale nada (ventaja +0,3%, t=0,5
// con 73 bloques). El paso 3 dice que «IV del flujo» SI predice el TAMANO del movimiento
// (2,8% vs 1,1% a un dia, t=13,95 sobre 73 bloques no solapados).
//
// Un predictor de TAMANO no se cobra con una call ni con una put: se cobra COMPRANDO LAS DOS.
// Aqui se compra el cono (call y put a la misma distancia), pagando los DOS ask reales y
// vendiendo los DOS bid reales, y se pregunta si el movimiento que predice supera lo que la
// cadena cobra por el.
//
// LAS TRES EXPLICACIONES ABURRIDAS QUE HAY QUE MATAR ANTES:
//   A) IDENTIDAD DE TICKER — «IV del flujo alta» = «es NVDA/TSLA», que se mueven mas siempre.
//      Control: ordenar DENTRO DE CADA TICKER contra su propia mediana.
//   B) DIA DE MERCADO — el tercio alto son los dias de CPI y todo se mueve. Control: ordenar
//      DENTRO DE CADA DIA (seccion cruzada pura) y t agrupada por dia.
//   C) YA ESTA EN EL PRECIO — la IV alta ya la cobra el ask. Solo lo resuelve el retorno real.
import { readFileSync } from "node:fs";
import { pasarBarrera, listonT, potencia } from "../lib/barreraHallazgos.ts";

const ops = JSON.parse(readFileSync("scripts/cache-theta/marketsnack/ops-comprar.json", "utf8"));
const CUENTA = 56389, DIAS_MUESTRA = 74, DIAS_ANO = 252;
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const pct = (x) => (x * 100).toFixed(1) + "%";

function tHonesta(filas, h) {
  const porDia = new Map();
  for (const f of filas) (porDia.get(f.fecha) ?? porDia.set(f.fecha, []).get(f.fecha)).push(f.pnl);
  const dias = [...porDia.keys()].sort();
  const bloques = [];
  for (let i = 0; i < dias.length; i += h) bloques.push(media(porDia.get(dias[i])));
  if (bloques.length < 3) return { t: NaN, n: bloques.length, m: NaN, dias: dias.length };
  return { t: media(bloques) / (sd(bloques) / Math.sqrt(bloques.length)), n: bloques.length, m: media(bloques), dias: dias.length };
}

// EL CONO con precios reales: se pagan los DOS ask, se cobran los DOS bid.
const cono = (o) => ({
  ask: o.askC + o.askP,
  sal: o.salC + o.salP,
  ret: (o.salC + o.salP - o.askC - o.askP) / (o.askC + o.askP),
});

const PLAZOS = [7, 30, 60], DIST = [0, 0.05, 0.10, 0.20], HOLD = [1, 5, 10, 20];
const N_PRUEBAS = 144;   // 48 celdas x 3 formas de ordenar la compuerta
const LISTON = listonT(N_PRUEBAS);
console.log("\n" + "=".repeat(104));
console.log(`COMPRAR LAS DOS PATAS · liston con ${N_PRUEBAS} pruebas -> |t| >= ${LISTON}`);
console.log("=".repeat(104));

// === 0. CUAL ES LA COMPOSICION DEL TERCIO ALTO? (explicacion A) ===
console.log("\n### 0 · QUE HAY DENTRO DEL TERCIO ALTO DE «IV del flujo»\n");
{
  const base = ops.filter((o) => o.plazo === 30 && o.dist === 0 && o.h === 1 && o.ivFlujo != null);
  const ord = [...base].sort((a, b) => b.ivFlujo - a.ivFlujo);
  const alto = ord.slice(0, Math.floor(ord.length / 3));
  const c = new Map();
  for (const o of alto) c.set(o.ticker, (c.get(o.ticker) ?? 0) + 1);
  const top = [...c].sort((a, b) => b[1] - a[1]);
  console.log("  ordenado GLOBAL:", top.slice(0, 10).map(([t, n]) => `${t}:${(n / alto.length * 100).toFixed(1)}%`).join(" "));
  console.log(`  el mayor es ${top[0][0]} con ${(top[0][1] / alto.length * 100).toFixed(1)}% (la criba de concentracion corta en 20%)`);
  const dc = new Map();
  for (const o of alto) dc.set(o.fecha, (dc.get(o.fecha) ?? 0) + 1);
  console.log(`  dias distintos representados en el tercio alto: ${dc.size} de 74 · maximo en un dia: ${Math.max(...dc.values())}`);
}

// === 1. EL CONO SIN COMPUERTA — la tasa base del vehiculo ===
console.log("\n\n### 1 · EL CONO SIN COMPUERTA (comprar las dos patas TODOS los dias) — la tasa base\n");
console.log("plazo dist salida      n   ret medio   mediana   %ganadoras   pago(x prima)   t(dia,no solap)");
const base = new Map();
for (const plazo of PLAZOS) for (const dist of DIST) for (const h of HOLD) {
  const g = ops.filter((o) => o.plazo === plazo && o.dist === dist && o.h === h);
  if (g.length < 50) continue;
  const filas = g.map((o) => { const c = cono(o); return { pnl: c.ret, ...c, ticker: o.ticker, fecha: o.fecha, tramo: o.tramo }; });
  const th = tHonesta(filas, h);
  base.set(`${plazo}|${dist}|${h}`, media(filas.map((f) => f.pnl)));
  console.log(`${String(plazo).padStart(4)}d ${String(dist * 100).padStart(3)}% ${String(h).padStart(5)}d ${String(filas.length).padStart(6)}  ${pct(media(filas.map((f) => f.pnl))).padStart(10)}  ${pct(mediana(filas.map((f) => f.pnl))).padStart(8)}  ${pct(filas.filter((f) => f.sal > f.ask).length / filas.length).padStart(10)}   ${media(filas.map((f) => f.sal / f.ask)).toFixed(3).padStart(12)}x  ${th.t.toFixed(2).padStart(14)}`);
}

// === 2. EL CONO CON LAS TRES COMPUERTAS ===
const ordenes = {
  GLOBAL: (g) => { const o = [...g].sort((a, b) => b.ivFlujo - a.ivFlujo); return o.slice(0, Math.floor(o.length / 3)); },
  // DENTRO DEL TICKER: cada ticker contra su propia historia -> mata «es que es NVDA»
  TICKER: (g) => {
    const porT = new Map();
    for (const o of g) (porT.get(o.ticker) ?? porT.set(o.ticker, []).get(o.ticker)).push(o);
    const out = [];
    for (const v of porT.values()) { v.sort((a, b) => b.ivFlujo - a.ivFlujo); out.push(...v.slice(0, Math.floor(v.length / 3))); }
    return out;
  },
  // DENTRO DEL DIA: seccion cruzada pura -> mata «es que ese dia era CPI»
  DIA: (g) => {
    const porD = new Map();
    for (const o of g) (porD.get(o.fecha) ?? porD.set(o.fecha, []).get(o.fecha)).push(o);
    const out = [];
    for (const v of porD.values()) { v.sort((a, b) => b.ivFlujo - a.ivFlujo); out.push(...v.slice(0, Math.floor(v.length / 3))); }
    return out;
  },
};
const guardados = [];
for (const [nombre, fn] of Object.entries(ordenes)) {
  console.log(`\n\n### 2.${nombre} · CONO con «IV del flujo» en el tercio ALTO, ordenado ${nombre}\n`);
  console.log("plazo dist salida      n   ret medio   sin compuerta   ganancia   mediana  %ganadoras  t(dia,no solap)  bloques");
  for (const plazo of PLAZOS) for (const dist of DIST) for (const h of HOLD) {
    const g0 = ops.filter((o) => o.plazo === plazo && o.dist === dist && o.h === h && o.ivFlujo != null);
    if (g0.length < 120) continue;
    const g = fn(g0);
    const filas = g.map((o) => { const c = cono(o); return { pnl: c.ret, ...c, ticker: o.ticker, fecha: o.fecha, tramo: o.tramo, ivFlujo: o.ivFlujo }; });
    if (filas.length < 50) continue;
    const th = tHonesta(filas, h);
    const b = base.get(`${plazo}|${dist}|${h}`);
    guardados.push({ nombre, plazo, dist, h, filas, th, b });
    const m = media(filas.map((f) => f.pnl));
    console.log(`${String(plazo).padStart(4)}d ${String(dist * 100).padStart(3)}% ${String(h).padStart(5)}d ${String(filas.length).padStart(6)}  ${pct(m).padStart(10)}  ${pct(b).padStart(14)}  ${pct(m - b).padStart(9)}  ${pct(mediana(filas.map((f) => f.pnl))).padStart(8)}  ${pct(filas.filter((f) => f.sal > f.ask).length / filas.length).padStart(10)}  ${th.t.toFixed(2).padStart(14)}   ${String(th.n).padStart(4)}${Math.abs(th.t) >= LISTON && m > 0 ? "  ***" : ""}`);
  }
}

// === 3. LA BARRERA SOBRE LAS CANDIDATAS ===
console.log(`\n\n### 3 · LA BARRERA sobre las celdas positivas con t honesta mas alta\n`);
const cands = guardados.filter((r) => media(r.filas.map((f) => f.pnl)) > 0 && r.th.n >= 10)
  .sort((a, b) => b.th.t - a.th.t).slice(0, 5);
if (!cands.length) console.log("  ninguna celda positiva llega a 10 bloques no solapados.");
for (const r of cands) {
  console.log(`\n── ${r.nombre} · plazo ${r.plazo}d · ${r.dist * 100}% fuera · salida ${r.h}d ──`);
  const v = pasarBarrera(r.filas, (f) => f.ivFlujo, { pruebas: N_PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
  console.log(`  n=${r.filas.length} · dias ${r.th.dias} · N EFECTIVA (bloques no solapados) = ${r.th.n}`);
  console.log(`  ret medio ${pct(media(r.filas.map((f) => f.pnl)))} · t(dia,no solap) ${r.th.t.toFixed(2)} vs liston ${LISTON}`);
  const A = r.filas.filter((f) => f.tramo === "A"), B = r.filas.filter((f) => f.tramo === "B");
  console.log(`  tramo A (antes 16-jul) n=${A.length} ret ${pct(media(A.map((f) => f.pnl)))} · tramo B n=${B.length} ret ${B.length ? pct(media(B.map((f) => f.pnl))) : "—"} · mismo signo: ${Math.sign(media(A.map((f) => f.pnl))) === Math.sign(media(B.map((f) => f.pnl))) ? "si" : "NO"}`);
  const c = new Map(); for (const f of r.filas) c.set(f.ticker, (c.get(f.ticker) ?? 0) + 1);
  const top = [...c].sort((x, y) => y[1] - x[1])[0];
  console.log(`  ticker mayor: ${top[0]} ${(top[1] / r.filas.length * 100).toFixed(1)}%`);
  console.log(`  ${potencia(r.filas, 0.05).mensaje}`);
  // los tres tercios de TIEMPO sobre el retorno del cono (no sobre una separacion)
  const ordF = [...r.filas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const k = Math.floor(ordF.length / 3);
  const t3 = [0, 1, 2].map((i) => { const gg = i < 2 ? ordF.slice(i * k, (i + 1) * k) : ordF.slice(2 * k); return { p: `${gg[0].fecha}->${gg[gg.length - 1].fecha}`, r: media(gg.map((f) => f.pnl)) }; });
  console.log(`  tres tercios de tiempo: ${t3.map((x) => `${x.p} ${pct(x.r)}`).join(" · ")} — mismo signo: ${t3.every((x) => Math.sign(x.r) === Math.sign(t3[0].r)) ? "si" : "NO"}`);
}

// === 4. DINERO ===
console.log(`\n\n### 4 · EN DOLARES AL ANO sobre una cuenta de $${CUENTA}\n`);
console.log("orden  plazo dist salida  ops/ano  prima/cono   ret/op      $/op       $/ano   capital comprometido");
for (const r of [...guardados].sort((a, b) => media(b.filas.map((f) => f.pnl)) * media(b.filas.map((f) => f.ask)) - media(a.filas.map((f) => f.pnl)) * media(a.filas.map((f) => f.ask))).slice(0, 8)) {
  const primaM = media(r.filas.map((f) => f.ask)) * 100;
  const rM = media(r.filas.map((f) => f.pnl));
  const opsAno = (r.filas.length / DIAS_MUESTRA) * DIAS_ANO;
  const dolarOp = primaM * rM;
  const simult = Math.max(1, Math.round((r.filas.length / r.th.dias) * r.h));
  console.log(`${r.nombre.padEnd(6)} ${String(r.plazo).padStart(4)}d ${String(r.dist * 100).padStart(3)}% ${String(r.h).padStart(5)}d ${opsAno.toFixed(0).padStart(8)}  $${primaM.toFixed(0).padStart(9)}  ${pct(rM).padStart(7)}  $${dolarOp.toFixed(0).padStart(8)}  $${(dolarOp * opsAno).toFixed(0).padStart(10)}  $${(primaM * simult).toFixed(0).padStart(11)} (${simult} a la vez)`);
}
