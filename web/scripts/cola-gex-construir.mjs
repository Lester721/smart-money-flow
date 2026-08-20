// ═══════════════════════════════════════════════════════════════════════════════════════════
// PASO 1 — RECONSTRUIR EL GEX DE LAS 11:00, día a día, para los 653 días del cóndor.
//
// QUÉ HAY Y QUÉ NO HAY (mirado ANTES de medir, no después):
//   · scripts/cache-theta/gex-2026/iv_AAAA-MM-DD_{C,P}.csv → cadena 0DTE de SPXW cada 5 min con
//     bid/ask/IV REALES. 654 días.
//   · scripts/cache-theta/gex-2026/oi_AAAA-MM-DD.csv       → SÍ HAY INTERÉS ABIERTO de SPXW.
//     654 ficheros. Cada uno trae DOS fechas: la víspera y el propio día de vencimiento.
//     El sello de tiempo de las filas del día es ~06:30 ET (antes de abrir): es la foto que
//     publica la OCC por la mañana y que refleja el CIERRE DE AYER. Por eso se usa esa y no la
//     de la víspera (que sería el cierre de anteayer, un día más vieja de lo necesario).
//     → Observable a las 11:00. NO hay futuro aquí.
//   · Rango de strikes del fichero de OI: de 200 a 12.400 según el día. NO está truncado a ±25%
//     como el fichero que tumbó el hallazgo del "OI lejos" el 16-ago. Se comprueba abajo.
//
// EL GEX SE CALCULA ASÍ:
//   gamma(K) con Black-Scholes alimentado con la **IV REAL del fichero** (BS sólo para la griega,
//   nunca para un precio — el precio siempre es bid/ask real).
//   $gamma(K) = gamma × OI(K) × 100 × S² × 0,01   ($ por cada 1% de movimiento)
//   net = Σcalls − Σputs   (convención de calle: dealers largos de calls, cortos de puts)
//   El SIGNO es una convención: se reporta el resultado y su espejo, no se elige a posteriori.
//
// Se sacan dos versiones del net porque a 5 horas de vencer la gamma ATM es un cuchillo:
//   net      = en el spot exacto de las 11:00
//   netSuave = promedio del net recalculado en una rejilla de ±0,5% alrededor del spot
//   flip     = nivel de spot donde el net cruza cero (nivel de gamma cero)
//
// Salida: scripts/cola-gex-filas.json — una fila por día.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00";
const COMM = 0.03;
const ALA = 50;
const ANCHO = 25;            // distancia del strike vendido al spot
const T = 5 / 24 / 365;      // 11:00 → 16:00 ET, en años

// ── Black-Scholes SOLO para gamma, con la IV real ──────────────────────────────────────────
const phi = (x) => 0.3989422804014327 * Math.exp(-x * x / 2);
const gammaBS = (S, K, t, v) => {
  const st = v * Math.sqrt(t);
  const d1 = (Math.log(S / K) + (v * v / 2) * t) / st;
  return phi(d1) / (S * st);
};

// ── lectura de un lado de la cadena a las 11:00 ────────────────────────────────────────────
function leerLado(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const txt = readFileSync(f, "utf8");
  const lin = txt.split("\n");
  if (lin.length < 3) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid"),
        iA = cab.indexOf("ask"), iM = cab.indexOf("midpoint"), iV = cab.indexOf("implied_vol"),
        iU = cab.indexOf("underlying_price");
  if ([iK, iT, iB, iA, iM, iV, iU].some((x) => x < 0))
    throw new Error(`${f}: faltan columnas — cabecera ${cab.join("|")}`);

  const filas = [];
  let spot11 = 0, spotFin = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const l = lin[j];
    if (l.length < 20) continue;
    const c = l.split(",");
    const hora = c[iT].slice(11, 16);
    const sp = +c[iU];
    if (sp > 0 && hora >= hFin) { hFin = hora; spotFin = sp; }
    if (hora !== HORA) continue;
    if (sp > 0) spot11 = sp;
    filas.push({ K: +c[iK], bid: +c[iB], ask: +c[iA], mid: +c[iM], iv: +c[iV] });
  }
  return { filas, spot11, cierre: spotFin, hFin };
}

// ── interés abierto: la foto de la mañana del propio día (= cierre de ayer) ─────────────────
function leerOI(fecha) {
  const f = `${DIR}/oi_${fecha}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"),
        iO = cab.indexOf("open_interest"), iR = cab.indexOf("right");
  if ([iK, iT, iO, iR].some((x) => x < 0)) throw new Error(`${f}: faltan columnas`);
  const C = new Map(), P = new Map();
  let horaMax = "";
  for (let j = 1; j < lin.length; j++) {
    const l = lin[j]; if (l.length < 10) continue;
    const c = l.split(",");
    if (c[iT].slice(0, 10) !== fecha) continue;          // sólo la foto del propio día
    const h = c[iT].slice(11, 16); if (h > horaMax) horaMax = h;
    const v = +c[iO]; if (!(v > 0)) continue;
    (c[iR].replace(/"/g, "") === "CALL" ? C : P).set(+c[iK], v);
  }
  return { C, P, horaMax };
}

// ── perfil de gamma en dólares ─────────────────────────────────────────────────────────────
// Devuelve la lista de {K, oi, iv, lado} utilizable, ya cribada.
function perfil(lado, filas, oiMap, spot, rangoPct) {
  const out = [];
  for (const f of filas) {
    if (!(f.K > 0)) continue;
    if (Math.abs(f.K - spot) / spot > rangoPct) continue;
    const oi = oiMap.get(f.K);
    if (!(oi > 0)) continue;
    if (!(f.iv > 0.02 && f.iv < 3)) continue;            // IV real utilizable
    if (!(f.ask > 0)) continue;
    out.push({ lado, K: f.K, oi, iv: f.iv });
  }
  return out;
}
const netEn = (perf, S) => {
  let c = 0, p = 0;
  for (const f of perf) {
    const g = gammaBS(S, f.K, T, f.iv);
    if (!isFinite(g)) continue;
    const d = g * f.oi * 100 * S * S * 0.01;
    if (f.lado === "C") c += d; else p += d;
  }
  return { c, p, net: c - p, abs: c + p };
};

const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

// ── recorrer ───────────────────────────────────────────────────────────────────────────────
const fechas = [...new Set(readdirSync(DIR)
  .map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
console.log(`${fechas.length} días con cadena de calls`);

const filas = [];
const descartes = { sinP: 0, sinOI: 0, sin11: 0, sinCierre: 0, pocoPerfil: 0, sinCondor: 0 };
let horasOImax = "";
let rangoOImin = 9, rangoOImax = 0;   // cobertura de strikes del fichero de OI, en % del spot

for (const fecha of fechas) {
  const C = leerLado(fecha, "C");
  const P = leerLado(fecha, "P");
  if (!C || !P) { descartes.sinP++; continue; }
  const spot = C.spot11 || P.spot11;
  if (!(spot > 0) || !C.filas.length || !P.filas.length) { descartes.sin11++; continue; }
  const cierre = Math.max(C.cierre, P.cierre);
  if (!(cierre > 0)) { descartes.sinCierre++; continue; }

  const oi = leerOI(fecha);
  if (!oi || (oi.C.size + oi.P.size) < 20) { descartes.sinOI++; continue; }
  if (oi.horaMax > horasOImax) horasOImax = oi.horaMax;
  {
    const ks = [...oi.C.keys(), ...oi.P.keys()];
    rangoOImin = Math.min(rangoOImin, (spot - Math.min(...ks)) / spot);
    rangoOImax = Math.max(rangoOImax, (Math.max(...ks) - spot) / spot);
  }

  // ── el cóndor, con precios reales (misma receta que desde-2024.mjs) ──
  const cC = cerca(C.filas.filter((x) => x.ask > 0), spot + ANCHO);
  const pC = cerca(P.filas.filter((x) => x.ask > 0), spot - ANCHO);
  const cL = cerca(C.filas.filter((x) => x.ask > 0), cC.K + ALA);
  const pL = cerca(P.filas.filter((x) => x.ask > 0), pC.K - ALA);
  if (cL.K <= cC.K || pL.K >= pC.K) { descartes.sinCondor++; continue; }
  const credito = cC.bid + pC.bid - cL.ask - pL.ask;
  if (!(credito > 0)) { descartes.sinCondor++; continue; }
  const pl = (credito
    - Math.min(Math.max(cierre - cC.K, 0), cL.K - cC.K)
    - Math.min(Math.max(pC.K - cierre, 0), pC.K - pL.K)) * 100 - 8 * COMM;

  // ── CONTROLES observables a las 11:00: la volatilidad implícita real del dinero ──
  // (para poder preguntar si el GEX aporta algo POR ENCIMA de la IV, o es la IV disfrazada)
  const utilC = C.filas.filter((x) => x.iv > 0.02 && x.iv < 3 && x.ask > 0);
  const utilP = P.filas.filter((x) => x.iv > 0.02 && x.iv < 3 && x.ask > 0);
  if (!utilC.length || !utilP.length) { descartes.pocoPerfil++; continue; }
  const ivC0 = cerca(utilC, spot).iv, ivP0 = cerca(utilP, spot).iv;
  const ivATM = (ivC0 + ivP0) / 2;
  const ivCallV = cerca(utilC, cC.K).iv, ivPutV = cerca(utilP, pC.K).iv;
  const skew = ivPutV - ivCallV;
  const sigmaPts = spot * ivATM * Math.sqrt(T);   // movimiento esperado 11:00→16:00, en puntos

  // ── el GEX ──
  const perfC = perfil("C", C.filas, oi.C, spot, 0.03);
  const perfP = perfil("P", P.filas, oi.P, spot, 0.03);
  const perf = [...perfC, ...perfP];
  if (perf.length < 30) { descartes.pocoPerfil++; continue; }

  const punto = netEn(perf, spot);

  // net promediado en una rejilla de ±0,5% (la gamma ATM a 5 h es un cuchillo)
  let sumaNet = 0, sumaAbs = 0, nG = 0;
  for (let i = -10; i <= 10; i++) {
    const S = spot * (1 + i * 0.0005);
    const r = netEn(perf, S);
    sumaNet += r.net; sumaAbs += r.abs; nG++;
  }
  const netSuave = sumaNet / nG, absSuave = sumaAbs / nG;

  // nivel de gamma cero: rejilla ±3% en pasos de 0,1%, primer cruce de signo desde abajo
  let flip = null, prevS = null, prevN = null;
  for (let i = -30; i <= 30; i++) {
    const S = spot * (1 + i * 0.001);
    const n = netEn(perf, S).net;
    if (prevN !== null && ((prevN < 0 && n >= 0) || (prevN > 0 && n <= 0))) {
      flip = prevS + (S - prevS) * (0 - prevN) / (n - prevN);
      break;
    }
    prevS = S; prevN = n;
  }

  // gamma concentrada en la zona de los strikes vendidos (±25 puntos) frente al total
  const zona = perf.filter((f) => Math.abs(f.K - spot) <= ANCHO);
  const nz = netEn(zona, spot);

  filas.push({
    fecha,
    ticker: "SPXW",
    spot, cierre, credito, pl,
    kC: cC.K, kP: pC.K,
    movDia: (cierre - spot) / spot,
    // controles de volatilidad (todos de las 11:00, IV real del fichero)
    ivATM, ivCallV, ivPutV, skew, sigmaPts,
    anchoRel: ANCHO / sigmaPts,        // a cuántas sigmas está el strike vendido
    horqRel: (cC.ask - cC.bid + pC.ask - pC.bid) / Math.max(credito, 0.01),
    // GEX
    gexC: punto.c, gexP: punto.p, gexNet: punto.net, gexAbs: punto.abs,
    gexNetSuave: netSuave, gexAbsSuave: absSuave,
    gexRatio: absSuave > 0 ? netSuave / absSuave : 0,       // escala‑libre, −1..+1
    gexNetNorm: netSuave / (spot * spot),                    // quita el nivel del índice
    flip, distFlip: flip ? (spot - flip) / spot : null,
    gexZonaNet: nz.net, gexZonaAbs: nz.abs,
    zonaSobreTotal: punto.abs > 0 ? nz.abs / punto.abs : 0,
    nStrikes: perf.length,
    oiTotal: perf.reduce((a, f) => a + f.oi, 0),
  });
}

console.log(`\nfilas construidas: ${filas.length}`);
console.log(`descartes: ${JSON.stringify(descartes)}`);
console.log(`hora máxima del sello del OI usado: ${horasOImax}  (tiene que ser de madrugada / pre-apertura)`);
console.log(`cobertura de strikes del OI: hasta −${(rangoOImin * 100).toFixed(0)}% y +${(rangoOImax * 100).toFixed(0)}% del spot`);

// contraste con las filas ya calculadas del régimen
const prev = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const mapa = new Map(prev.map((r) => [r.fecha, r]));
let comunes = 0, iguales = 0, difMax = 0;
for (const f of filas) {
  const r = mapa.get(f.fecha); if (!r) continue;
  comunes++;
  const d = Math.abs(r.pl - f.pl);
  if (d < 0.02) iguales++; else difMax = Math.max(difMax, d);
}
console.log(`\ncontraste con regimen-filas.json: ${comunes} días comunes, ${iguales} con el MISMO P&L (dif<$0,02), dif máxima ${difMax.toFixed(2)}`);

writeFileSync("scripts/cola-gex-filas.json", JSON.stringify(filas));
console.log(`escrito scripts/cola-gex-filas.json`);
