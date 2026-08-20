// PASO 3 — ¿SIRVE ALGÚN PANEL DE MARKETSNACK PARA COMPRAR CALLS O PUTS?
//
// Ninguna de las 11 métricas sobrevivió contra el RETORNO DE LA ACCIÓN. Se mide la que quedó MÁS
// CERCA — "IV del flujo" (t=2,53 · listón 3,01) — y la más cercana DIRECCIONAL, el lado/sentiment
// (t=2,39 · listón 3,10; son el MISMO panel: sentiment = f(side, call/put) al 100%). Van con
// handicap declarado: se eligieron por haber quedado cerca en otra medición sobre los mismos días.
import { readFileSync } from "node:fs";
import { pasarBarrera, listonT, tWelch, potencia } from "../lib/barreraHallazgos.ts";

const ops = JSON.parse(readFileSync("scripts/cache-theta/marketsnack/ops-comprar.json", "utf8"));
const CUENTA = 56389, DIAS_MUESTRA = 74, DIAS_ANO = 252;
const PLAZOS = [7, 30, 60], DIST = [0, 0.05, 0.10, 0.20], HOLD = [1, 5, 10, 20];
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (x) => (x * 100).toFixed(1) + "%";

// ── t AGRUPADA POR DÍA y sobre BLOQUES NO SOLAPADOS: la única honesta con 74 días ──
// Dos operaciones del mismo día son el mismo mercado; dos entradas separadas por menos de h días
// de mercado comparten camino. Se promedia dentro del día y se toma 1 de cada h días.
function tHonesta(filas, h) {
  const porDia = new Map();
  for (const f of filas) (porDia.get(f.fecha) ?? porDia.set(f.fecha, []).get(f.fecha)).push(f.pnl);
  const dias = [...porDia.keys()].sort();
  const bloques = [];
  for (let i = 0; i < dias.length; i += h) bloques.push(media(porDia.get(dias[i])));
  if (bloques.length < 3) return { t: NaN, n: bloques.length, m: NaN, dias: dias.length };
  return { t: media(bloques) / (sd(bloques) / Math.sqrt(bloques.length)), n: bloques.length, m: media(bloques), dias: dias.length };
}

const N_PRUEBAS = 96;                       // 48 celdas x 2 variantes (directa y con compuerta)
const LISTON = listonT(N_PRUEBAS);
console.log("\n" + "=".repeat(102));
console.log(`LISTON: ${N_PRUEBAS} pruebas (3 plazos x 4 distancias x 4 salidas x 2 variantes) -> |t| >= ${LISTON}`);
console.log(`Cuenta $${CUENTA} · muestra ${DIAS_MUESTRA} dias de mercado (2026-04-22 -> 2026-08-06)`);
console.log("=".repeat(102));

// === 1. EL VEHICULO: comprar al azar (control) ===
console.log("\n### 1 · EL CONTROL — comprar una opcion AL AZAR (cara o cruz entre call y put)\n");
console.log("plazo  dist  salida       n   %sin valor   pago medio(x prima)   retorno medio");
for (const plazo of PLAZOS) for (const dist of DIST) for (const h of HOLD) {
  const g = ops.filter((o) => o.plazo === plazo && o.dist === dist && o.h === h);
  if (g.length < 30) continue;
  const rets = g.flatMap((o) => [o.retC, o.retP]);
  const sal = g.flatMap((o) => [o.salC / o.askC, o.salP / o.askP]);
  const cero = g.flatMap((o) => [o.salC, o.salP]).filter((v) => v <= 0.001).length;
  console.log(`${String(plazo).padStart(4)}d  ${String(dist * 100).padStart(3)}%  ${String(h).padStart(4)}d  ${String(g.length * 2).padStart(6)}   ${pct(cero / (g.length * 2)).padStart(9)}   ${media(sal).toFixed(3).padStart(16)}x   ${pct(media(rets)).padStart(13)}`);
}

// === 2. LA SENAL DIRECCIONAL: lado/sentiment -> call o put ===
console.log("\n\n### 2 · LA SENAL — el lado del flujo elige call o put · PAGANDO EL ASK, VENDIENDO AL BID\n");
console.log("Comprar la CALL si el flujo neto del dia es alcista, la PUT si es bajista.");
console.log("«ventaja» = retorno de la senal - retorno de la moneda al aire, MISMO ticker, MISMO dia, MISMOS contratos.\n");
const resultados = [];
console.log("plazo dist salida      n   senal ret    azar ret    ventaja   t(dia,no solap)  bloques  aciertos");
for (const plazo of PLAZOS) for (const dist of DIST) for (const h of HOLD) {
  const g = ops.filter((o) => o.plazo === plazo && o.dist === dist && o.h === h && o.neto !== 0);
  if (g.length < 50) continue;
  const filas = g.map((o) => {
    const alcista = o.neto > 0;
    const rSig = alcista ? o.retC : o.retP;
    const rAz = (o.retC + o.retP) / 2;
    return { pnl: rSig - rAz, rSig, rAz, ticker: o.ticker, fecha: o.fecha, tramo: o.tramo,
             sal: alcista ? o.salC : o.salP, ask: alcista ? o.askC : o.askP };
  });
  const th = tHonesta(filas, h);
  const acierto = filas.filter((f) => f.sal > f.ask).length / filas.length;
  resultados.push({ plazo, dist, h, filas, th, acierto });
  const marca = Math.abs(th.t) >= LISTON ? "  ***" : "";
  console.log(`${String(plazo).padStart(4)}d ${String(dist * 100).padStart(3)}% ${String(h).padStart(5)}d ${String(filas.length).padStart(6)}  ${pct(media(filas.map((f) => f.rSig))).padStart(10)}  ${pct(media(filas.map((f) => f.rAz))).padStart(10)}  ${pct(media(filas.map((f) => f.pnl))).padStart(9)}   ${th.t.toFixed(2).padStart(9)}    ${String(th.n).padStart(4)}    ${pct(acierto).padStart(6)}${marca}`);
}

// === 3. LA PREGUNTA NUEVA: la senal predice movimientos GRANDES? ===
console.log("\n\n### 3 · LA PREGUNTA QUE NUNCA SE HABIA HECHO — predice el TAMANO del movimiento?\n");
console.log("Comprar una opcion no necesita acertar la media, necesita movimientos GRANDES.");
console.log("Se ordena por «IV del flujo» (el panel que quedo mas cerca) y se mide |dS|/S del subyacente.\n");
console.log("salida   n(ticker-dia)   |d| tercio ALTO   |d| tercio BAJO   separacion   t(Welch)   t(dia,no solap)");
for (const h of HOLD) {
  const g = ops.filter((o) => o.plazo === 30 && o.dist === 0 && o.h === h && o.ivFlujo != null && o.Ssal != null);
  if (g.length < 50) continue;
  const ord = [...g].map((o) => ({ iv: o.ivFlujo, mov: Math.abs(o.Ssal - o.S) / o.S, ticker: o.ticker, fecha: o.fecha }))
    .sort((a, b) => b.iv - a.iv);
  const k = Math.floor(ord.length / 3);
  const A = ord.slice(0, k), B = ord.slice(-k);
  const alto = A.map((x) => x.mov), bajo = B.map((x) => x.mov);
  // t honesta de la DIFERENCIA: se empareja por dia (media alto del dia - media bajo del dia)
  const dA = new Map(), dB = new Map();
  for (const x of A) (dA.get(x.fecha) ?? dA.set(x.fecha, []).get(x.fecha)).push(x.mov);
  for (const x of B) (dB.get(x.fecha) ?? dB.set(x.fecha, []).get(x.fecha)).push(x.mov);
  const comunes = [...dA.keys()].filter((d) => dB.has(d)).sort();
  const difs = [];
  for (let i = 0; i < comunes.length; i += h) difs.push(media(dA.get(comunes[i])) - media(dB.get(comunes[i])));
  const tD = difs.length >= 3 ? media(difs) / (sd(difs) / Math.sqrt(difs.length)) : NaN;
  console.log(`${String(h).padStart(5)}d   ${String(g.length).padStart(13)}   ${pct(media(alto)).padStart(15)}   ${pct(media(bajo)).padStart(15)}   ${pct(media(alto) - media(bajo)).padStart(10)}   ${tWelch(alto, bajo).toFixed(2).padStart(8)}   ${tD.toFixed(2).padStart(15)} (n=${difs.length})`);
}

// === 4. LA COMPUERTA: senal direccional SOLO en los dias de IV del flujo alta ===
console.log("\n\n### 4 · CON COMPUERTA — el lado solo cuando «IV del flujo» esta en el tercio ALTO\n");
console.log("plazo dist salida      n   senal ret    azar ret    ventaja   t(dia,no solap)  aciertos");
const conCompuerta = [];
for (const plazo of PLAZOS) for (const dist of DIST) for (const h of HOLD) {
  const base = ops.filter((o) => o.plazo === plazo && o.dist === dist && o.h === h && o.neto !== 0 && o.ivFlujo != null);
  if (base.length < 90) continue;
  const ord = [...base].sort((a, b) => b.ivFlujo - a.ivFlujo);
  const g = ord.slice(0, Math.floor(ord.length / 3));
  const filas = g.map((o) => { const al = o.neto > 0; return {
    pnl: (al ? o.retC : o.retP) - (o.retC + o.retP) / 2, rSig: al ? o.retC : o.retP, rAz: (o.retC + o.retP) / 2,
    ticker: o.ticker, fecha: o.fecha, tramo: o.tramo, sal: al ? o.salC : o.salP, ask: al ? o.askC : o.askP }; });
  const th = tHonesta(filas, h);
  const acierto = filas.filter((f) => f.sal > f.ask).length / filas.length;
  conCompuerta.push({ plazo, dist, h, filas, th, acierto });
  console.log(`${String(plazo).padStart(4)}d ${String(dist * 100).padStart(3)}% ${String(h).padStart(5)}d ${String(filas.length).padStart(6)}  ${pct(media(filas.map((f) => f.rSig))).padStart(10)}  ${pct(media(filas.map((f) => f.rAz))).padStart(10)}  ${pct(media(filas.map((f) => f.pnl))).padStart(9)}   ${th.t.toFixed(2).padStart(9)}    ${pct(acierto).padStart(6)}${Math.abs(th.t) >= LISTON ? "  ***" : ""}`);
}

// === 5. LOS DOS TRAMOS DE LA RUPTURA DEL 2026-07-16 ===
console.log("\n\n### 5 · LOS DOS TRAMOS — antes y despues del 2026-07-16 (MS cambio su tuberia)\n");
console.log("plazo dist salida   n(A)   ventaja A     t(A)    n(B)   ventaja B     t(B)   mismo signo?");
for (const r of resultados.filter((r) => r.h <= 5)) {
  const A = r.filas.filter((f) => f.tramo === "A"), B = r.filas.filter((f) => f.tramo === "B");
  if (A.length < 30 || B.length < 30) continue;
  const tA = tHonesta(A, r.h), tB = tHonesta(B, r.h);
  const mismo = Math.sign(media(A.map((f) => f.pnl))) === Math.sign(media(B.map((f) => f.pnl)));
  console.log(`${String(r.plazo).padStart(4)}d ${String(r.dist * 100).padStart(3)}% ${String(r.h).padStart(5)}d ${String(A.length).padStart(6)}  ${pct(media(A.map((f) => f.pnl))).padStart(10)}  ${tA.t.toFixed(2).padStart(6)}  ${String(B.length).padStart(6)}  ${pct(media(B.map((f) => f.pnl))).padStart(10)}  ${tB.t.toFixed(2).padStart(6)}   ${mismo ? "si" : "NO"}`);
}

// === 6. LA CELDA MAS FUERTE POR LA BARRERA COMPLETA ===
const todas = [...resultados.map((r) => ({ ...r, variante: "directa" })), ...conCompuerta.map((r) => ({ ...r, variante: "compuerta" }))];
const mejor = todas.slice().sort((a, b) => Math.abs(b.th.t) - Math.abs(a.th.t))[0];
console.log(`\n\n### 6 · LA CELDA MAS FUERTE DE LAS ${todas.length} · ${mejor.variante} · plazo ${mejor.plazo}d · ${mejor.dist * 100}% fuera · salida ${mejor.h}d\n`);
const v = pasarBarrera(mejor.filas, (f) => f.pnl, { pruebas: N_PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
console.log(informeCorto(v));
console.log(`  potencia: ${potencia(mejor.filas, 0.05).mensaje}`);
console.log(`  n filas ${mejor.filas.length} · dias distintos ${mejor.th.dias} · N EFECTIVA (bloques no solapados) = ${mejor.th.n}`);
console.log(`  t agrupada por dia y sin solape = ${mejor.th.t.toFixed(2)} (la de pasarBarrera trata cada fila como independiente y NO lo son)`);

// === 7. DINERO ===
console.log("\n\n### 7 · EN DOLARES AL ANO — lo que paga la senal directa\n");
const porDinero = resultados.slice().sort((a, b) => media(b.filas.map((f) => f.rSig)) - media(a.filas.map((f) => f.rSig)));
console.log("plazo dist salida  ops/ano  prima media   ret medio/op      $/op       $/ano   capital comprometido");
for (const r of [...porDinero.slice(0, 4), ...porDinero.slice(-3)]) {
  const primaM = media(r.filas.map((f) => f.ask)) * 100;
  const rM = media(r.filas.map((f) => f.rSig));
  const opsAno = (r.filas.length / DIAS_MUESTRA) * DIAS_ANO;
  const dolarOp = primaM * rM;
  const simultaneas = Math.ceil((r.filas.length / r.th.dias) * r.h);
  console.log(`${String(r.plazo).padStart(4)}d ${String(r.dist * 100).padStart(3)}% ${String(r.h).padStart(5)}d ${opsAno.toFixed(0).padStart(8)}  $${primaM.toFixed(0).padStart(10)}  ${pct(rM).padStart(12)}  $${dolarOp.toFixed(0).padStart(8)}  $${(dolarOp * opsAno).toFixed(0).padStart(10)}  $${(primaM * simultaneas).toFixed(0).padStart(11)} (${simultaneas} a la vez)`);
}

function informeCorto(vv) {
  const l = [vv.pasa ? "  PASA LAS CUATRO CRIBAS" : "  NO PASA LA BARRERA"];
  for (const m of vv.motivos) l.push(`    x ${m}`);
  for (const a of vv.aprobadas) l.push(`    ok ${a}`);
  l.push(`    n=${vv.detalle.n} · sep ${vv.detalle.sep != null ? (vv.detalle.sep * 100).toFixed(2) + "%" : "—"} · t=${vv.detalle.t?.toFixed(2)} (liston ${vv.detalle.listonT})`);
  return l.join("\n");
}
