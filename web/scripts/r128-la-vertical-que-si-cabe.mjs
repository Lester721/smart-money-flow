// ══ LA VERTICAL QUE SÍ CABE ══ Lester, 2026-08-28.
//
// ═══ EL MURO ═══════════════════════════════════════════════════════════════════════════════
// r127 midió que mezclar calls de índice con la put semanal bate a comprar SPY en las DOS
// columnas (16,4% contra 15,1% y caída −16% contra −32%), y que el efecto es diversificación
// de verdad: sale igual reequilibrando cada semana o no reequilibrando nunca.
//
// Pero la put es CUBIERTA CON EFECTIVO y QQQ está a $691: una sola put pide **$67.100**
// de colateral, el **121% de la cuenta de Lester**. La mezcla, tal como está medida,
// NO SE PUEDE EJECUTAR. Ni al 100% de peso.
//
// ═══ EL PUENTE ═════════════════════════════════════════════════════════════════════════════
// La misma pata, pero como VERTICAL: se vende la put del 3% fuera y se compra otra más abajo.
// El colateral pasa de $67.100 a la ANCHURA (unos $2.000-5.000), y en Robinhood es un botón
// ([[lester-opera-en-robinhood]]: verticales sí, iron condors no).
//
// Lo que hay que medir, y puede salir en contra:
//   1. la pata comprada se lleva parte de la prima → menos ingreso
//   2. el colateral pequeño MULTIPLICA el resultado sobre el capital: bueno y malo a la vez
//   3. son DOS horquillas en vez de una — y [[hallazgo-horquilla-porcentaje-de-la-prima]]
//      dice que la horquilla es un % de la PRIMA, así que puede comerse el margen entero
//
// Se mide a punto medio Y cruzando la horquilla (vender al bid, comprar al ask). Las dos.
import fs from "node:fs";
const S = new URL("./cache-theta/noche-2026-08-10", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const COMM = 0.03;
const HORA = "12:00";
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const pct = (x, n = 1) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(n) + "%";

// ── mismo lector que intradia-lib, mismos filtros de cotización rota ──
const spot = new Map();
for (const f of fs.readdirSync(S + "/theta-griegas")) {
  const lin = fs.readFileSync(`${S}/theta-griegas/${f}`, "utf8").split("\n");
  const cab = lin[0].split(","); const iT = cab.indexOf("timestamp"), iC = cab.indexOf("close");
  for (let n = 1; n < lin.length; n++) { const c = lin[n].split(","); if (c.length < cab.length) continue;
    spot.set(c[iT].slice(0, 16).replace("T", " "), +c[iC]); } }
const px = new Map(JSON.parse(fs.readFileSync(S + "/precios.json", "utf8")).QQQ.map((b) => [b.d, b.c]));
function leerEOD(f) {
  if (!fs.existsSync(f)) return null;
  const lin = fs.readFileSync(f, "utf8").split("\n"); const cab = lin[0].split(",");
  const iK = cab.indexOf("strike"), iB = cab.indexOf("bid"), iA = cab.indexOf("ask");
  const m = new Map();
  for (let n = 1; n < lin.length; n++) { const c = lin[n].split(","); if (c.length < cab.length) continue;
    const bid = +c[iB], ask = +c[iA]; if (!(bid > 0) || !(ask > 0) || ask < bid) continue;
    if ((ask - bid) / ((ask + bid) / 2) > 0.50) continue;
    m.set(+c[iK], { bid, ask, mid: (bid + ask) / 2 }); }
  return m; }
function leerIntra(rolo, exp) {
  const f = `${S}/theta-intra/QQQ_${rolo}_${exp}.csv`;
  if (!fs.existsSync(f)) return null;
  const lin = fs.readFileSync(f, "utf8").split("\n"); const cab = lin[0].split(",");
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid"), iA = cab.indexOf("ask");
  const m = new Map();
  for (let n = 1; n < lin.length; n++) {
    const c = lin[n].split(","); if (c.length < cab.length) continue;
    const bid = +c[iB], ask = +c[iA];
    if (!(bid > 0) || !(ask > 0) || ask < bid) continue;
    if ((ask - bid) / ((ask + bid) / 2) > 0.50) continue;
    const h = c[iT].slice(11, 16);
    if (!m.has(h)) m.set(h, new Map());
    m.get(h).set(+c[iK], { bid, ask, mid: (bid + ask) / 2 }); }
  return m; }
function tipo(rolo, exp) {
  const p = leerEOD(`${S}/theta-sem/QQQ_${rolo}_${exp}_P.csv`), c = leerEOD(`${S}/theta-sem/QQQ_${rolo}_${exp}_C.csv`);
  if (!p || !c) return 0;
  const S0 = px.get(rolo); if (S0 == null) return 0;
  let r = 0, dm = 1e9, T = (new Date(exp) - new Date(rolo)) / 365 / 864e5;
  for (const [K, pp] of p) { const cc = c.get(K); if (!cc) continue; const d = Math.abs(K - S0);
    if (d < dm) { dm = d; const v = (S0 - cc.mid + pp.mid) / K; const rr = -Math.log(v) / T;
      if (rr > -0.02 && rr < 0.12) r = rr; } }
  return r; }

const viernes = [];
{ const d = new Date(Date.UTC(2020, 0, 3));
  while (d < new Date(Date.UTC(2026, 7, 1))) { viernes.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 7); } }

// ── una operación: vende la put del 3% fuera; si ANCHO>0, compra otra ANCHO dólares más abajo ──
function opera(rolo, exp, ancho, cruzar) {
  const intra = leerIntra(rolo, exp); if (!intra) return null;
  const cad = intra.get(HORA); if (!cad) return null;
  const S0 = spot.get(`${rolo} ${HORA}`); if (S0 == null) return null;
  const ST = px.get(exp); if (ST == null) return null;
  const T = (new Date(exp) - new Date(rolo)) / 365 / 864e5, r = tipo(rolo, exp);
  const vencEOD = leerEOD(`${S}/theta-venc/QQQ_${exp}_P.csv`);

  const obj = S0 * 0.97;
  let K = null, dif = 1e9;
  for (const k of cad.keys()) { const d = Math.abs(k - obj); if (d < dif) { dif = d; K = k; } }
  if (K == null || dif > S0 * 0.01) return null;
  const corto = cad.get(K);
  const cobroC = cruzar ? corto.bid : corto.mid;

  if (!ancho) {   // put cubierta con efectivo, EXACTAMENTE como r127
    let pl;
    if (ST < K) { const c = vencEOD?.get(K); pl = (cobroC - (c ? c.ask : Math.max(K - ST, 0))) * 100 - 2 * COMM; }
    else pl = cobroC * 100 - COMM;
    pl += K * 100 * (Math.exp(r * T) - 1);
    return { rolo, exp, K, S0, ST, pl, capital: K * 100, ret: pl / (K * 100) }; }

  // vertical: se busca el strike comprado más cercano a K-ancho
  let K2 = null, d2 = 1e9;
  for (const k of cad.keys()) { if (k >= K) continue; const d = Math.abs(k - (K - ancho)); if (d < d2) { d2 = d; K2 = k; } }
  if (K2 == null || d2 > ancho * 0.5) return null;
  const largo = cad.get(K2);
  const pagoL = cruzar ? largo.ask : largo.mid;
  const credito = cobroC - pagoL;
  if (!(credito > 0)) return null;
  const W = K - K2;

  // desenlace: valor intrínseco de las dos patas al vencimiento. Si el corto acaba dentro,
  // se RECOMPRA la vertical con las cotizaciones reales del viernes de vencimiento.
  let pl;
  if (ST < K) {
    const c1 = vencEOD?.get(K), c2 = vencEOD?.get(K2);
    const recompra = (c1 ? (cruzar ? c1.ask : c1.mid) : Math.max(K - ST, 0)) -
                     (c2 ? (cruzar ? c2.bid : c2.mid) : Math.max(K2 - ST, 0));
    pl = (credito - Math.max(0, Math.min(W, recompra))) * 100 - 4 * COMM;
  } else pl = credito * 100 - 2 * COMM;
  pl += W * 100 * (Math.exp(r * T) - 1);          // el colateral de la vertical también renta
  return { rolo, exp, K, K2, S0, ST, pl, capital: W * 100, ret: pl / (W * 100) }; }

function serie(ancho, cruzar) {
  const O = [];
  for (let i = 0; i < viernes.length - 1; i++) { const o = opera(viernes[i], viernes[i+1], ancho, cruzar); if (o) O.push(o); }
  return O; }
function met(O) {
  if (!O.length) return null;
  let eq = 1, pico = 1, dd = 0;
  for (const x of O) { eq *= (1 + x.ret); pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico); }
  const anos = (new Date(O[O.length-1].exp) - new Date(O[0].rolo)) / 365 / 864e5;
  const R = O.map((x) => x.ret), m = R.reduce((a,x)=>a+x,0)/R.length;
  const sd = Math.sqrt(R.reduce((a,x)=>a+(x-m)**2,0)/(R.length-1));
  return { n: O.length, anual: 100*(Math.pow(eq, 1/anos)-1), caida: 100*dd, sharpe: (m*52-0.033)/(sd*Math.sqrt(52)),
    gan: 100*O.filter((x)=>x.ret>0).length/O.length, peor: 100*Math.min(...R), capital: O[O.length-1].capital, R, O }; }

console.log("");
console.log("  ══ AUDIT ══");
const cs = met(serie(0, false));
console.log("  la put cubierta a punto medio (control, tiene que dar ~13,5% y −7%): " +
  cs.anual.toFixed(1) + "% · caída −" + cs.caida.toFixed(0) + "% · n=" + cs.n +
  (Math.abs(cs.anual - 13.5) < 1.5 ? "  ✓ cuadra con r127" : "  ⚠ NO cuadra"));
console.log("  colateral de la put cubierta hoy: " + D(cs.capital) + "  ·  la cuenta de Lester: $55.419");
console.log("");

console.log("  ══ 1 · LA VERTICAL, POR ANCHURA ══  (vender la put del 3% fuera, comprar N$ más abajo)");
console.log("");
console.log("  " + "estructura".padEnd(24) + "colateral".padStart(12) + "al año".padStart(9) + "caída".padStart(8) +
  "Sharpe".padStart(8) + "acierta".padStart(9) + "peor sem".padStart(10) + "n".padStart(6));
const FILAS = [];
for (const [nom, ancho] of [["put cubierta", 0], ["vertical de $30", 30], ["vertical de $20", 20],
                            ["vertical de $15", 15], ["vertical de $10", 10], ["vertical de $5", 5]]) {
  const m = met(serie(ancho, false)); if (!m) continue;
  FILAS.push({ nom, ancho, m });
  console.log("  " + nom.padEnd(24) + D(m.capital).padStart(12) + (m.anual.toFixed(1)+"%").padStart(9) +
    ("−"+m.caida.toFixed(0)+"%").padStart(8) + m.sharpe.toFixed(2).padStart(8) +
    (m.gan.toFixed(0)+"%").padStart(9) + pct(m.peor,1).padStart(10) + String(m.n).padStart(6)); }
console.log("");
console.log("  ══ 2 · CRUZANDO LA HORQUILLA ══  (vender al bid, comprar al ask — son DOS horquillas)");
console.log("");
console.log("  " + "estructura".padEnd(24) + "a punto medio".padStart(16) + "cruzando".padStart(12) + "se pierde".padStart(12));
for (const { nom, ancho, m } of FILAS) {
  const c = met(serie(ancho, true)); if (!c) continue;
  console.log("  " + nom.padEnd(24) + (m.anual.toFixed(1)+"%").padStart(16) + (c.anual.toFixed(1)+"%").padStart(12) +
    ((m.anual - c.anual).toFixed(1) + " pts").padStart(12)); }
console.log("");
