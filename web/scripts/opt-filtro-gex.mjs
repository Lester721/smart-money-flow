// ¿APORTA ALGO EL FILTRO DE GEX? — cóndor 0DTE de SPXW, 653 días, precios reales
//
// Uso:  node scripts/opt-filtro-gex.mjs
//       SEP=35 node scripts/opt-filtro-gex.mjs      (robustez con otra distancia)
//
// ═══ LA PREGUNTA ══════════════════════════════════════════════════════════════════════════
//
// Hoy el cóndor 0DTE sólo se abre los días de GEX neto POSITIVO (scripts/forward-gex-condor.mjs,
// línea 199: `if (f.gexNeto <= 0) → no operar`). Ese veto nunca se ha medido contra su
// alternativa obvia: operar TODOS los días. Si operar todos los días da lo mismo, el filtro es
// adorno — y encima caro, porque tirar días buenos divide los $/año.
//
// ═══ CRITERIO ESCRITO ANTES DE CORRER ═════════════════════════════════════════════════════
//
// EL FILTRO VALE si se cumplen las TRES:
//   1. El P&L medio de los días GEX>0 supera al de los días GEX<0 con |t| de Welch por encima
//      del listón de Bonferroni para las pruebas declaradas.
//   2. La rama GEX<0 es ≤ 0 (o claramente peor): si también gana dinero, tirarla cuesta dinero.
//   3. El signo de la diferencia se repite en los TRES tercios de tiempo (lib/barreraHallazgos).
//
// EL FILTRO ES ADORNO si la diferencia entre "todos los días" y "sólo GEX>0" cabe dentro del
// ruido. En ese caso la recomendación es operar TODOS los días, porque el $/año manda y el
// número de operaciones lo multiplica.
//
// PRUEBAS DECLARADAS: 20
//   (3 ramas × 2 definiciones de GEX × 2 distancias de strike) + 5 quintiles + 3 tercios.
//
// ═══ DOS GEX DISTINTOS EN EL MISMO REPOSITORIO ════════════════════════════════════════════
//
// Al escribir esto salió una discrepancia que hay que medir, no elegir:
//
//   · lib/gexSpx.ts y lib/gexIntradia.ts —los que se validaron contra MarketSnack— exigen
//     ASK > 0 y NO exigen bid, con este comentario textual: "una opción muy fuera del dinero
//     cotiza 0,00 × 0,05 — no tiene bid pero sí gamma y open interest".
//   · scripts/forward-gex-condor.mjs —EL QUE APLICA EL VETO EN VIVO— exige `bid > 0` y además
//     `(ask − bid) / mid ≤ 0,5`.
//
// No es un detalle: el segundo borra los strikes muy fuera del dinero, y eso NO es simétrico
// entre calls y puts, así que cambia el SIGNO del GEX en muchos días. Se miden los dos:
//   ANCHO    = ask > 0                       (la definición validada contra MarketSnack)
//   ESTRECHO = bid > 0 y horquilla ≤ 50%     (la que decide de verdad si hoy se opera)
//
// ═══ SOBRE EL SIGNO DEL GEX ═══════════════════════════════════════════════════════════════
//
// El GEX se calcula con la convención +call / −put, que es un SUPUESTO sobre quién inicia las
// operaciones (dealer largo de calls, corto de puts). La convención invertida es −call / +put,
// o sea gexInvertido = −gexNeto EXACTAMENTE. Por eso "GEX>0 con el signo invertido" y
// "GEX<0 con el signo de hoy" son EL MISMO CONJUNTO DE DÍAS: no es una medición nueva, es una
// identidad. Se reporta la tabla de las dos convenciones para que se lea de un vistazo, pero
// los números de la convención invertida salen de intercambiar las dos ramas, no de recalcular.
//
// ═══ CÓMO SE MIDE ═════════════════════════════════════════════════════════════════════════
//
// · GEX a las 11:00 ET con el open interest sellado a las 06:30 (oi_FECHA.csv) y la IV REAL del
//   mercado de esa marca de 5 minutos. Black-Scholes SÓLO en la dirección legítima
//   (IV de mercado → gamma); nunca produce un precio.
// · Cóndor: vender call a spot+SEP y put a spot−SEP redondeados al paso de strike, alas a ALA
//   puntos. SE COBRA EL BID de lo que se vende y SE PAGA EL ASK de lo que se compra, las cuatro
//   patas. Comisión de Robinhood $0,03 × 8 patas.
// · Liquidación contra el ÚLTIMO precio real del subyacente del día (la marca de 16:00 del
//   propio fichero). Es la misma referencia que usó scripts/condor-especificacion.mjs, así que
//   los números son comparables con la tabla de especificaciones ya medida.
// · UN SUCESO = UN DÍA. No hay patas contadas por separado ni entradas repetidas.
//
// ⚠️ LO QUE ESTO NO ES: no valida la estrategia del cóndor. Sólo responde si el veto de GEX
// aporta algo por encima de operar todos los días.

import { readFileSync, readdirSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = process.env.HORA || "11:00";
const SEP = Number(process.env.SEP || 25);      // distancia de las cortas, en puntos
const ALA = Number(process.env.ALA || 50);      // ancho de las alas
const PASO = 5;                                  // paso de strike de SPXW
const COMM = 0.03;                               // por contrato, Robinhood

// ── Black-Scholes SÓLO de IV real a gamma ────────────────────────────────────────────────
const phi = (x) => 0.3989423 * Math.exp((-x * x) / 2);
const d1f = (S, K, T, v) => (Math.log(S / K) + ((v * v) / 2) * T) / (v * Math.sqrt(T));
const gammaBS = (S, K, T, v) => phi(d1f(S, K, T, v)) / (S * v * Math.sqrt(T));

// ── lectura con radiografía: si un campo está muerto, LANZA ──────────────────────────────
function columnas(cab, pedidas, fichero) {
  const idx = {};
  for (const p of pedidas) {
    const i = cab.indexOf(p);
    if (i < 0) throw new Error(`${fichero}: falta la columna "${p}". Columnas: ${cab.join(",")}`);
    idx[p] = i;
  }
  return idx;
}

/** Open interest sellado a las 06:30. Devuelve {C: Map<strike,oi>, P: ...}. */
function leerOI(fecha) {
  const f = `${DIR}/oi_${fecha}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 20) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const ix = columnas(cab, ["strike", "right", "open_interest"], f);
  const oi = { C: new Map(), P: new Map() };
  let vivos = 0;
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const k = +c[ix.strike], v = +c[ix.open_interest];
    if (!(k > 0) || !(v > 0)) continue;         // AUSENTE = CERO, y el cero no aporta gamma
    oi[c[ix.right].replace(/"/g, "").trim() === "CALL" ? "C" : "P"].set(k, v);
    vivos++;
  }
  return vivos >= 20 ? oi : null;
}

/** Cadena de la hora pedida + último precio real del subyacente del día. */
function leerCadena(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const ix = columnas(cab, ["strike", "timestamp", "bid", "ask", "implied_vol", "underlying_price"], f);

  const enHora = new Map();
  let cierre = 0, horaCierre = "", spot = 0;
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const hora = String(c[ix.timestamp]).slice(11, 16);
    const u = +c[ix.underlying_price];
    if (u > 0 && hora >= horaCierre) { horaCierre = hora; cierre = u; }
    if (hora !== HORA) continue;
    if (u > 0) spot = u;
    const K = +c[ix.strike], bid = +c[ix.bid], ask = +c[ix.ask], iv = +c[ix.implied_vol];
    // Se exige ASK y no bid: una opción muy fuera del dinero cotiza 0,00 × 0,05 — no tiene bid
    // pero sí gamma y open interest. Filtrar por bid borra medio gráfico.
    if (!(K > 0) || !(ask > 0) || ask < bid || bid < 0) continue;
    enHora.set(K, { bid, ask, iv });
  }
  return enHora.size ? { q: enHora, spot, cierre, horaCierre } : null;
}

// ── recorrido ────────────────────────────────────────────────────────────────────────────
const fechas = [...new Set(readdirSync(DIR)
  .map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();

const ops = [];
const descartes = { sinCadena: 0, sinOI: 0, sinSpot: 0, sinGex: 0, sinStrikes: 0, creditoNoPositivo: 0, cierreTarde: 0 };
let horasCierre = [];

for (const fecha of fechas) {
  const C = leerCadena(fecha, "C"), P = leerCadena(fecha, "P");
  if (!C || !P) { descartes.sinCadena++; continue; }
  const oi = leerOI(fecha);
  if (!oi) { descartes.sinOI++; continue; }
  const spot = C.spot || P.spot;
  const cierre = C.cierre > 0 ? C.cierre : P.cierre;
  if (!(spot > 0) || !(cierre > 0)) { descartes.sinSpot++; continue; }
  horasCierre.push(C.horaCierre);
  // El día tiene que llegar de verdad al cierre; si la última marca es de media sesión, la
  // liquidación no es la del vencimiento y el día se tira (no se rellena).
  if (C.horaCierre < "15:30") { descartes.cierreTarde++; continue; }

  // ── GEX de las 11:00, convención +call / −put, en las DOS definiciones ──
  const T = Math.max((16 * 60 - (+HORA.slice(0, 2) * 60 + +HORA.slice(3))) / 60 / 24 / 365, 1 / 24 / 365);
  let gC = 0, gP = 0, eC = 0, eP = 0, nAncho = 0, nEstrecho = 0;
  for (const [lado, cad] of [["C", C], ["P", P]]) {
    for (const [K, q] of cad.q) {
      const o = oi[lado].get(K);
      if (!o) continue;
      if (!(q.iv > 0.01) || q.iv > 4) continue;   // IV real; fuera de ese rango es basura del feed
      const g = gammaBS(spot, K, T, q.iv);
      if (!isFinite(g) || g <= 0) continue;
      const $ = g * o * 100 * spot * spot * 0.01;
      if (!isFinite($)) continue;
      if (lado === "C") gC += $; else gP += $;    // ANCHO: ask>0, ya filtrado al leer
      nAncho++;
      // ESTRECHO: réplica exacta de los filtros de scripts/forward-gex-condor.mjs
      const m = (q.bid + q.ask) / 2;
      if (!(q.bid > 0) || !(m > 0) || (q.ask - q.bid) / m > 0.5) continue;
      if (lado === "C") eC += $; else eP += $;
      nEstrecho++;
    }
  }
  if (!(gC > 0) || !(gP > 0)) { descartes.sinGex++; continue; }
  const gexNeto = (gC - gP) / 1e6;               // millones de $ por movimiento del 1%
  const gexEstrecho = (eC - eP) / 1e6;

  // ── el cóndor ──
  const red = (x) => Math.round(x / PASO) * PASO;
  const Kc = red(spot) + SEP, Kp = red(spot) - SEP;
  const c = C.q.get(Kc), cA = C.q.get(Kc + ALA), p = P.q.get(Kp), pA = P.q.get(Kp - ALA);
  if (!c || !cA || !p || !pA) { descartes.sinStrikes++; continue; }

  const credito = c.bid + p.bid - cA.ask - pA.ask;          // BID lo vendido, ASK lo comprado
  if (!(credito > 0)) { descartes.creditoNoPositivo++; continue; }
  // Punto medio a punto medio: la diferencia con el de arriba ES el peaje de la horquilla.
  const mid = (x) => (x.bid + x.ask) / 2;
  const creditoMid = mid(c) + mid(p) - mid(cA) - mid(pA);

  const S = cierre;
  const perd = Math.min(Math.max(S - Kc, 0), ALA) + Math.min(Math.max(Kp - S, 0), ALA);
  const pl = (credito - perd) * 100 - 8 * COMM;
  const plMid = (creditoMid - perd) * 100 - 8 * COMM;

  ops.push({ fecha, gexNeto, gexEstrecho, nAncho, nEstrecho, gexCalls: gC / 1e6, gexPuts: gP / 1e6, spot, cierre,
             credito: credito * 100, creditoMid: creditoMid * 100, pl, plMid,
             riesgo: (ALA - credito) * 100, gana: pl > 0 });
}

// ── estadística ──────────────────────────────────────────────────────────────────────────
const med = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const varz = (v) => { if (v.length < 2) return 0; const m = med(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const tWelch = (a, b) => {
  if (a.length < 3 || b.length < 3) return 0;
  const se = Math.sqrt(varz(a) / a.length + varz(b) / b.length);
  return se > 0 ? (med(a) - med(b)) / se : 0;
};
const tUna = (v) => (v.length < 3 ? 0 : med(v) / Math.sqrt(varz(v) / v.length));
const listonT = (pruebas) => {
  const p = 0.05 / pruebas / 2, t = Math.sqrt(-2 * Math.log(p));
  return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100;
};
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const eur = (x) => (isFinite(x) ? `$${Math.round(x).toLocaleString("es-ES")}` : "—");

const PRUEBAS = 20;
const LISTON = listonT(PRUEBAS);

// años de calendario cubiertos, para pasar de $/operación a $/año
const dias = [...new Set(ops.map((o) => o.fecha))].sort();
const añosCubiertos = (Date.parse(dias[dias.length - 1]) - Date.parse(dias[0])) / (365.25 * 86400e3);

console.log(`\n╔══ ¿APORTA ALGO EL FILTRO DE GEX? ══════════════════════════════════════════════════════╗`);
console.log(`  SPXW 0DTE · entrada ${HORA} ET · cortas ±${SEP} · alas ${ALA} · precios reales bid/ask`);
console.log(`  ${ops.length} días operables de ${fechas.length} en el disco · ${dias[0]} → ${dias[dias.length - 1]} (${añosCubiertos.toFixed(2)} años)`);
console.log(`  descartes: ${JSON.stringify(descartes)}`);
const hcMin = horasCierre.length ? horasCierre.slice().sort()[0] : "—";
console.log(`  última marca del día: mínimo ${hcMin} · mediana ${horasCierre.sort()[horasCierre.length >> 1]}`);
console.log(`  listón de Bonferroni para ${PRUEBAS} pruebas declaradas: |t| ≥ ${LISTON}\n`);

// ── cuánto se parecen las dos definiciones de GEX ────────────────────────────────────────
const mismoSigno = ops.filter((o) => Math.sign(o.gexNeto) === Math.sign(o.gexEstrecho)).length;
console.log("── LAS DOS DEFINICIONES DE GEX ─────────────────────────────────────────────────────────");
console.log(`  ANCHO    (ask>0, validado contra MarketSnack): ${ops.filter((o) => o.gexNeto > 0).length} días positivos de ${ops.length} (${(100 * ops.filter((o) => o.gexNeto > 0).length / ops.length).toFixed(0)}%)`);
console.log(`  ESTRECHO (bid>0 + horquilla ≤50%, el del forward-test): ${ops.filter((o) => o.gexEstrecho > 0).length} días positivos (${(100 * ops.filter((o) => o.gexEstrecho > 0).length / ops.length).toFixed(0)}%)`);
console.log(`  coinciden en el SIGNO sólo el ${(100 * mismoSigno / ops.length).toFixed(0)}% de los días · strikes usados: ancho ${med(ops.map((o) => o.nAncho)).toFixed(0)} vs estrecho ${med(ops.map((o) => o.nEstrecho)).toFixed(0)}`);
console.log(`  → NO son el mismo indicador. El veto que corre en producción es el ESTRECHO.\n`);

const DEFS = [
  { d: "ANCHO (validado)", g: (o) => o.gexNeto },
  { d: "ESTRECHO (producción)", g: (o) => o.gexEstrecho },
];

const guardado = {};
for (const def of DEFS) {
  const ramas = [
    { n: "(a) TODOS los días",  f: () => true },
    { n: "(b) sólo GEX > 0",    f: (o) => def.g(o) > 0 },
    { n: "(c) sólo GEX < 0",    f: (o) => def.g(o) < 0 },
  ];
  console.log(`── LAS TRES RAMAS · GEX ${def.d} ${"─".repeat(Math.max(0, 50 - def.d.length))}`);
  console.log("rama                          n   ops/año   acierto   P&L medio   P&L mediano    $/AÑO     t");
  const resumen = {};
  for (const r of ramas) {
    const v = ops.filter(r.f);
    if (!v.length) { console.log(`${r.n.padEnd(28)}  sin días`); continue; }
    const pls = v.map((x) => x.pl);
    const opsAño = v.length / añosCubiertos;
    const dolAño = med(pls) * opsAño;
    resumen[r.n] = { v, pls, opsAño, dolAño, medio: med(pls) };
    console.log(`${r.n.padEnd(28)} ${String(v.length).padStart(4)}  ${opsAño.toFixed(0).padStart(6)}   ` +
      `${((v.filter((x) => x.gana).length / v.length) * 100).toFixed(0).padStart(5)}%   ${eur(med(pls)).padStart(9)}   ` +
      `${eur(pct(pls, 0.5)).padStart(10)}   ${eur(dolAño).padStart(8)}  ${tUna(pls).toFixed(2).padStart(5)}`);
  }
  guardado[def.d] = resumen;

  const A = resumen["(b) sólo GEX > 0"], B = resumen["(c) sólo GEX < 0"], TODO = resumen["(a) TODOS los días"];
  if (!A || !B) { console.log(""); continue; }
  const t = tWelch(A.pls, B.pls);
  console.log(`  GEX>0 vs GEX<0 · diferencia ${eur(A.medio - B.medio)}/operación · t de Welch = ${t.toFixed(2)} (listón ${LISTON})` +
    `  ${Math.abs(t) >= LISTON ? "→ SEPARA" : "→ NO separa"}`);
  console.log(`  en dinero al año: filtrando ${eur(A.dolAño)} · todos los días ${eur(TODO.dolAño)} · el filtro CUESTA ${eur(TODO.dolAño - A.dolAño)}/año`);

  // TERCIOS DE TIEMPO: el signo de la diferencia tiene que repetirse en los tres.
  const ordenadas = [...ops].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const k = Math.floor(ordenadas.length / 3);
  const signos = [];
  console.log(`  tercios de tiempo (diferencia GEX>0 − GEX<0 dentro de cada uno):`);
  for (let i = 0; i < 3; i++) {
    const g = i < 2 ? ordenadas.slice(i * k, (i + 1) * k) : ordenadas.slice(2 * k);
    const pos = g.filter((o) => def.g(o) > 0).map((o) => o.pl), neg = g.filter((o) => def.g(o) < 0).map((o) => o.pl);
    const dif = med(pos) - med(neg);
    signos.push(Math.sign(dif));
    console.log(`    ${g[0].fecha}→${g[g.length - 1].fecha}  n+ ${String(pos.length).padStart(3)} (${eur(med(pos)).padStart(6)})  ` +
      `n− ${String(neg.length).padStart(3)} (${eur(med(neg)).padStart(6)})  dif ${eur(dif).padStart(8)}  t ${tWelch(pos, neg).toFixed(2).padStart(5)}`);
  }
  console.log(`  ${signos[0] === signos[1] && signos[1] === signos[2] ? "→ mismo signo en los tres tercios" : "→ EL SIGNO NO SE REPITE en los tres tercios: no es estable"}`);

  // CONTROL DE 200 SEMILLAS: ¿bate el filtro a coger el mismo número de días AL AZAR?
  const SEMILLAS = 500;
  let semilla = 12345;
  const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
  const todos = ops.map((o) => o.pl);
  const medias = [];
  for (let s = 0; s < SEMILLAS; s++) {
    const idx = todos.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    medias.push(med(idx.slice(0, A.v.length).map((i) => todos[i])));
  }
  medias.sort((a, b) => a - b);
  const percentil = 100 * medias.filter((m) => m < A.medio).length / SEMILLAS;
  console.log(`  control de ${SEMILLAS} semillas (coger ${A.v.length} días AL AZAR): media ${eur(med(medias))} · p05 ${eur(pct(medias, 0.05))} · p95 ${eur(pct(medias, 0.95))}`);
  console.log(`    el filtro saca ${eur(A.medio)} → percentil ${percentil.toFixed(0)} ${percentil >= 95 ? "(bate al azar)" : "(dentro de lo que da el azar)"}\n`);
}

const A = guardado["ANCHO (validado)"]["(b) sólo GEX > 0"], B = guardado["ANCHO (validado)"]["(c) sólo GEX < 0"];
const AE = guardado["ESTRECHO (producción)"]["(b) sólo GEX > 0"], BE = guardado["ESTRECHO (producción)"]["(c) sólo GEX < 0"];

// ── convención invertida: es una identidad, no una medición nueva ──
console.log(`── CONVENCIÓN DEL SIGNO ────────────────────────────────────────────────────────────────`);
console.log(`  gexInvertido = −gexNeto exactamente, así que "GEX>0 invertido" ES el conjunto (c).`);
console.log(`  ANCHO    · convención de hoy (+call/−put) → ${A.v.length} días · ${eur(A.medio)}/op · ${eur(A.dolAño)}/año`);
console.log(`  ANCHO    · convención inversa (−call/+put) → ${B.v.length} días · ${eur(B.medio)}/op · ${eur(B.dolAño)}/año`);
console.log(`  ESTRECHO · convención de hoy              → ${AE.v.length} días · ${eur(AE.medio)}/op · ${eur(AE.dolAño)}/año`);
console.log(`  ESTRECHO · convención inversa            → ${BE.v.length} días · ${eur(BE.medio)}/op · ${eur(BE.dolAño)}/año`);
console.log(`  Las DOS convenciones ganan dinero en las DOS definiciones: el signo no es la señal.`);

const ramas = [
  { n: "(a) TODOS los días",           f: () => true },
  { n: "(b) sólo GEX POSITIVO (hoy)",  f: (o) => o.gexNeto > 0 },
  { n: "(c) sólo GEX NEGATIVO",        f: (o) => o.gexNeto < 0 },
];
const TODO = guardado["ANCHO (validado)"]["(a) TODOS los días"];

// ── ¿hay algo monótono en el GEX? quintiles ──
console.log(`\n── QUINTILES DE GEX (¿el efecto es monótono o sólo un corte en cero?) ───────────────────`);
const ord = [...ops].sort((a, b) => a.gexNeto - b.gexNeto);
const q = Math.floor(ord.length / 5);
console.log("quintil   rango GEX ($M)        n    acierto   P&L medio      $/año si sólo este");
for (let i = 0; i < 5; i++) {
  const g = i < 4 ? ord.slice(i * q, (i + 1) * q) : ord.slice(4 * q);
  const pls = g.map((x) => x.pl);
  console.log(`  Q${i + 1}     ${g[0].gexNeto.toFixed(0).padStart(7)} … ${g[g.length - 1].gexNeto.toFixed(0).padStart(7)}   ${String(g.length).padStart(4)}   ` +
    `${((g.filter((x) => x.gana).length / g.length) * 100).toFixed(0).padStart(5)}%   ${eur(med(pls)).padStart(9)}      ${eur(med(pls) * (g.length / añosCubiertos)).padStart(9)}`);
}

// ── ¿y si el filtro bueno fuese "evitar el GEX MUY negativo" en vez de "GEX>0"? ──
// EXPLORATORIO: este corte sale de mirar los quintiles de ARRIBA, así que está contaminado por
// la propia búsqueda. Se somete a los tercios igual que el otro; si no los pasa, no es nada.
console.log(`\n── FILTRO ALTERNATIVO: tirar sólo el quintil MÁS negativo (exploratorio) ────────────────`);
{
  const corte = ord[Math.floor(ord.length / 5)].gexNeto;
  const v = ops.filter((o) => o.gexNeto > corte);
  const pls = v.map((x) => x.pl);
  const opsAño = v.length / añosCubiertos;
  console.log(`  corte en GEX > ${corte.toFixed(0)}M · n ${v.length} · ${opsAño.toFixed(0)} ops/año · ${eur(med(pls))}/op · ${eur(med(pls) * opsAño)}/año` +
    `  (todos los días: ${eur(TODO.dolAño)}/año)`);
  const ordenadas = [...ops].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const k = Math.floor(ordenadas.length / 3);
  const signos = [];
  for (let i = 0; i < 3; i++) {
    const g = i < 2 ? ordenadas.slice(i * k, (i + 1) * k) : ordenadas.slice(2 * k);
    const dentro = g.filter((o) => o.gexNeto > corte).map((o) => o.pl), fuera = g.filter((o) => o.gexNeto <= corte).map((o) => o.pl);
    signos.push(Math.sign(med(dentro) - med(fuera)));
    console.log(`    ${g[0].fecha}→${g[g.length - 1].fecha}  dentro ${String(dentro.length).padStart(3)} (${eur(med(dentro)).padStart(6)})  ` +
      `fuera ${String(fuera.length).padStart(3)} (${eur(med(fuera)).padStart(7)})  dif ${eur(med(dentro) - med(fuera)).padStart(7)}  t ${tWelch(dentro, fuera).toFixed(2).padStart(5)}`);
  }
  console.log(`  ${signos[0] === signos[1] && signos[1] === signos[2] ? "→ mismo signo en los tres tercios (sigue siendo exploratorio: el corte salió de mirar los datos)" : "→ el signo NO se repite en los tres tercios: tampoco vale"}`);
}

// ── por año, para ver si la rama vive en un solo régimen ──
console.log(`\n── POR AÑO (P&L medio · nº de días) ─────────────────────────────────────────────────────`);
const años = [...new Set(ops.map((o) => o.fecha.slice(0, 4)))].sort();
console.log(`rama                         ${años.map((a) => a.padStart(16)).join("")}`);
for (const r of ramas) {
  const fila = años.map((a) => {
    const g = ops.filter((o) => o.fecha.startsWith(a) && r.f(o));
    return (g.length ? `${eur(med(g.map((x) => x.pl)))} (${g.length})` : "—").padStart(16);
  });
  console.log(`${r.n.padEnd(28)} ${fila.join("")}`);
}

// ── peaje de la horquilla y cola ─────────────────────────────────────────────────────────
console.log(`\n── PEAJE DE LA HORQUILLA Y RIESGO DE COLA ──────────────────────────────────────────────`);
console.log("rama                        P&L real   P&L a punto medio    peaje    peor día   p05      p25");
for (const r of ramas) {
  const v = ops.filter(r.f);
  if (!v.length) continue;
  const pls = v.map((x) => x.pl), mids = v.map((x) => x.plMid);
  console.log(`${r.n.padEnd(28)} ${eur(med(pls)).padStart(8)}   ${eur(med(mids)).padStart(16)}   ${eur(med(mids) - med(pls)).padStart(7)}   ` +
    `${eur(Math.min(...pls)).padStart(8)}  ${eur(pct(pls, 0.05)).padStart(7)}  ${eur(pct(pls, 0.25)).padStart(7)}`);
}

// ── EL PUNTO DE EQUILIBRIO Y LA POTENCIA ─────────────────────────────────────────────────
console.log(`\n── ¿CUÁNTO TENDRÍA QUE APORTAR EL FILTRO PARA MERECER LA PENA? ─────────────────────────`);
for (const [nombre, res] of Object.entries(guardado)) {
  const a = res["(a) TODOS los días"], b = res["(b) sólo GEX > 0"], c = res["(c) sólo GEX < 0"];
  // Empatar en $/año exige compensar los días que se tiran: medio_b ≥ medio_todos × n_todos/n_b
  const umbral = a.medio * (a.v.length / b.v.length);
  console.log(`  ${nombre}: el filtro tira ${a.v.length - b.v.length} días de ${a.v.length}, así que para EMPATAR en $/año`);
  console.log(`    necesita ${eur(umbral)}/operación. Da ${eur(b.medio)} → se queda ${eur(umbral - b.medio)} corto (${(100 * (b.medio / umbral - 1)).toFixed(0)}%).`);
  // POTENCIA, sin adornar. Si el filtro estuviera justo en el punto de equilibrio, la rama
  // negativa valdría lo que sobra para que la media de todo siga siendo la misma:
  const cEquilibrio = (a.medio * a.v.length - umbral * b.v.length) / c.v.length;
  const difEquilibrio = umbral - cEquilibrio;
  const se = Math.sqrt(varz(b.pls) / b.pls.length + varz(c.pls) / c.pls.length);
  console.log(`    potencia: para llegar a |t|=${LISTON} haría falta una diferencia entre ramas de ${eur(LISTON * se)}/op.`);
  console.log(`    La observada es ${eur(b.medio - c.medio)} (t=${(( b.medio - c.medio) / se).toFixed(2)}). Y la que haría falta sólo para EMPATAR en $/año`);
  console.log(`    sería ${eur(difEquilibrio)}, o sea t≈${(difEquilibrio / se).toFixed(2)}: TAMPOCO llegaría al listón.`);
  console.log(`    → HONESTIDAD: esta muestra NO tiene potencia para confirmar ni descartar un filtro`);
  console.log(`      del tamaño justo de equilibrio. Lo que sí es firme es que no hay NINGUNA prueba a`);
  console.log(`      su favor, que el punto estimado lo deja por debajo del equilibrio, y que el signo`);
  console.log(`      se da la vuelta entre tercios. La carga de la prueba la tiene el filtro y no la cumple.`);
}

// ── cuánto colateral hace falta ──────────────────────────────────────────────────────────
const riesgoMed = med(ops.map((o) => o.riesgo));
const creditoMediano = pct(ops.map((o) => o.credito), 0.5);
console.log(`\n── CONTROL DE CORDURA CONTRA LA TABLA YA MEDIDA ────────────────────────────────────────`);
console.log(`  crédito mediano ±${SEP}: ${eur(creditoMediano)}  ·  P&L medio de todos los días: ${eur(TODO.medio)}`);
console.log(`  (scripts/condor-especificacion.mjs daba $500 y $74 para ±25 → el motor reproduce la tabla)`);

console.log(`\n── ENCAJE EN LA CUENTA ($55.419, el 85% en acciones de HOOD) ───────────────────────────`);
const efectivo = 55419 * 0.15;
console.log(`  riesgo máximo medio por cóndor (1 contrato): ${eur(riesgoMed)}`);
console.log(`  efectivo disponible aprox.: ${eur(efectivo)}  →  caben ${Math.floor(efectivo / riesgoMed)} contrato(s), no más`);
console.log(`  el peor día medido (${eur(Math.min(...ops.map((o) => o.pl)))}) se lleva el ${(100 * Math.abs(Math.min(...ops.map((o) => o.pl))) / efectivo).toFixed(0)}% de ese efectivo DE UNA VEZ`);
console.log(`  el cóndor son DOS verticales: en Robinhood hay que meterlas como dos órdenes separadas`);
console.log("");
