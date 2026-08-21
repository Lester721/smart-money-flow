// ¿HAY UN CUARTO SÍ? — el GEX como filtro ENCIMA de los tres síes.
//
// ═══ LA INCOHERENCIA QUE LO MOTIVA ══════════════════════════════════════════════════════════
//
// Lester lo vio: "si el GEX es útil para colocar un cóndor, ¿lo estamos usando en nuestras
// estrategias?". La respuesta es que sólo a medias — uno de los cuatro cuadernos que corren
// (forward:gex-condor) lo usa, pero **la regla que damos como la buena, los tres síes, no.**
//
// Y el GEX como FILTRO del cóndor sí salió positivo en su día (+3,93%, t=2,09), aunque con el
// n inflado por entradas del mismo día. Así que la pregunta es legítima.
//
// ═══ LO QUE ESTO PUEDE Y NO PUEDE HACER ═════════════════════════════════════════════════════
//
// PUEDE decir si el GEX aporta algo encima de las tres preguntas.
// NO PUEDE cambiar la regla que está en forward test. `PRE-REGISTRO-tres-sies.md` la congeló, y
// cambiarla ahora reinicia el reloj: un forward test que se retoca deja de ser un forward test.
// Si el cuarto sí sale bien, se pre-registra APARTE y se abre otro cuaderno.
//
// Y cuenta como pruebas nuevas sobre los mismos días. El proyecto lleva ~300; esto suma 6 más.
//
// ═══ QUÉ SE MIDE ════════════════════════════════════════════════════════════════════════════
//
// El GEX total de la apertura (09:35), con el interés abierto real de ese día:
//   · GEX POSITIVO  → los dealers clavan el precio. Un cóndor debería ir mejor.
//   · GEX NEGATIVO  → amplifican. Debería ir peor.
//
// Se prueba sobre los tres síes y, como control, sobre el cóndor sin ningún filtro: si el GEX
// separa igual en los dos, no está aportando nada que los tres síes no capturen ya.
//
// Uso: node --import tsx --max-old-space-size=12288 scripts/gex-cuarto-si.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const OIDIR = "scripts/cache-theta/oi-spxw";
const HORA = "11:00", HORA_GEX = "09:35", COMM = 0.03, ALA = 50;
const PRUEBAS_NUEVAS = 6;

const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(suma(v.map((x) => (x - m) ** 2)) / (v.length - 1)); };
const tDe = (v) => (v.length > 2 ? media(v) / (sd(v) / Math.sqrt(v.length)) : NaN);
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
const num = (x, d = 2) => (isFinite(x) ? x.toFixed(d) : "—");

const phi = (x) => 0.3989422804014327 * Math.exp((-x * x) / 2);
function gammaBS(S, K, T, v) {
  if (!(S > 0) || !(K > 0) || !(T > 0) || !(v > 0)) return 0;
  const d1 = (Math.log(S / K) + (v * v / 2) * T) / (v * Math.sqrt(T));
  const g = phi(d1) / (S * v * Math.sqrt(T));
  return isFinite(g) ? g : 0;
}

/** Lee la cadena del día: precios a las 11:00 (para el cóndor) e IV a las 09:35 (para el GEX). */
function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const ix = ["strike", "timestamp", "bid", "ask", "underlying_price", "implied_vol"].map((c) => cab.indexOf(c));
  if (ix.slice(0, 5).some((x) => x < 0)) return null;
  const [iK, iT, iB, iA, iU, iV] = ix;
  const enHora = [], apertura = [];
  let spotFin = 0, hFin = "", spotAp = 0;
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), hora = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && hora >= hFin) { hFin = hora; spotFin = sp; }
    const K = Number(c[iK]);
    if (hora === HORA) {
      const bid = Number(c[iB]), ask = Number(c[iA]);
      if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
    }
    if (hora === HORA_GEX && iV >= 0) {
      const iv = Number(c[iV]);
      if (K > 0 && iv > 0.01 && iv < 4 && sp > 0) { apertura.push({ K, iv }); spotAp = sp; }
    }
  }
  return enHora.length ? { filas: enHora, cierre: spotFin, apertura, spotAp } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

function condorDe(C, P, dist) {
  const spot = C.filas[0].spot, S = C.cierre;
  const cC = cerca(C.filas, spot + dist), pC = cerca(P.filas, spot - dist);
  const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
  if (cL.K <= cC.K || pL.K >= pC.K) return null;
  const cred = cC.bid + pC.bid - cL.ask - pL.ask;
  if (!(cred > 0)) return null;
  const aC = cL.K - cC.K, aP = pC.K - pL.K;
  const dC = Math.min(Math.max(S - cC.K, 0), aC), dP = Math.min(Math.max(pC.K - S, 0), aP);
  return { pl: (cred - dC - dP) * 100 - 8 * COMM, credito: cred * 100 };
}

// ── construir los días ──────────────────────────────────────────────────────
const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
const dias = [];
let sinOI = 0;
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0) || !(C.filas[0].spot > 0)) continue;
  const fOI = `${OIDIR}/${fecha}.json`;
  if (!existsSync(fOI)) { sinOI++; continue; }       // SIN interés abierto no se mide
  const oi = JSON.parse(readFileSync(fOI, "utf8"));

  // EL GEX DE LA APERTURA — con la IV de las 09:35 y el OI publicado antes de abrir.
  // Se calcula ANTES de las 11:00, que es cuando se entraría. No mira al futuro.
  const S = C.spotAp;
  if (!(S > 0) || !C.apertura.length || !P.apertura.length) continue;
  const T = ((16 - 9) * 60 - 35) / (60 * 6.5 * 252);
  let gex = 0;
  for (const [lado, lista] of [["C", C.apertura], ["P", P.apertura]]) {
    for (const s of lista) {
      const peso = Number(oi[`${s.K}|${lado}`] ?? 0);
      if (!(peso > 0)) continue;
      const g = gammaBS(S, s.K, T, s.iv) * peso * 100 * S * S * 0.01;
      if (!isFinite(g) || g <= 0) continue;
      gex += lado === "C" ? g : -g;                  // dealers largos de calls, cortos de puts
    }
  }
  const c45 = condorDe(C, P, 45), c25 = condorDe(C, P, 25);
  if (!c45 || !c25) continue;
  dias.push({ fecha, gex, pl45: c45.pl, cred45: c45.credito, pl25: c25.pl });
}

// ── los tres síes ───────────────────────────────────────────────────────────
const serie = [];
for (const y of [2021, 2022, 2023, 2024, 2025, 2026]) {
  const f = `scripts/cache-theta/SPY_spotmin_y_${y}.json`;
  if (!existsSync(f)) continue;
  for (const [d, arr] of Object.entries(JSON.parse(readFileSync(f, "utf8")))) {
    const m = new Map(arr.map(([mi, p]) => [mi, p]));
    const c = m.get(960), p11 = m.get(660);
    if (c > 0 && p11 > 0) serie.push({ fecha: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, c, p11 });
  }
}
serie.sort((a, b) => a.fecha.localeCompare(b.fecha));
const idx = new Map(serie.map((d, i) => [d.fecha, i]));
for (const d of dias) {
  const i = idx.get(d.fecha);
  if (i === undefined || i < 55) { d.tresSies = false; continue; }
  const cierres = serie.slice(Math.max(0, i - 200), i).map((x) => x.c);
  const p11 = serie[i].p11;
  d.tresSies = p11 > media(cierres.slice(-5)) && p11 > media(cierres.slice(-50)) && d.cred45 >= 100;
}

console.log(`\n## ${dias.length.toLocaleString("es-ES")} días con cadena, interés abierto y GEX de apertura · ${sinOI} descartados sin OI`);
console.log(`   ${dias[0].fecha} → ${dias[dias.length - 1].fecha}`);
console.log(`   GEX positivo en ${dias.filter((d) => d.gex > 0).length} días · negativo en ${dias.filter((d) => d.gex < 0).length}\n`);

function linea(nombre, sub, campo) {
  if (sub.length < 30) { console.log(`| ${nombre} | ${sub.length} | muestra corta | | | |`); return null; }
  const pls = sub.map((d) => d[campo]);
  const anos = (Date.parse(dias[dias.length - 1].fecha) - Date.parse(dias[0].fecha)) / 86_400_000 / 365.25;
  const alAno = suma(pls) / anos;
  console.log(`| ${nombre} | ${sub.length} | ${eur(suma(pls))} | **${eur(alAno)}** | ${eur(media(pls))} | ${num(tDe(pls), 2)} |`);
  return { n: sub.length, total: suma(pls), alAno, medio: media(pls), t: tDe(pls) };
}

const CAB = "| qué | días | total | al año | por operación | t |";
const SEP = "|---|---|---|---|---|---|";

console.log("=".repeat(96));
console.log("  ¿APORTA EL GEX ENCIMA DE LOS TRES SÍES?");
console.log("=".repeat(96) + "\n");
const t3 = dias.filter((d) => d.tresSies);
console.log(CAB); console.log(SEP);
const base = linea("**los tres síes** (como está desplegado)", t3, "pl45");
const conPos = linea("· + GEX positivo (el cuarto sí)", t3.filter((d) => d.gex > 0), "pl45");
const conNeg = linea("· + GEX negativo", t3.filter((d) => d.gex < 0), "pl45");

console.log(`\n### CONTROL · el mismo corte sobre el cóndor SIN filtro\n`);
console.log(CAB); console.log(SEP);
const b25 = linea("±25 sin filtro", dias, "pl25");
const p25 = linea("· + GEX positivo", dias.filter((d) => d.gex > 0), "pl25");
const n25 = linea("· + GEX negativo", dias.filter((d) => d.gex < 0), "pl25");

// ── ¿separa el GEX por sí mismo? prueba pareada por día ───────────────────
console.log(`\n### ¿Separa el GEX? — diferencia entre días de GEX positivo y negativo\n`);
console.log("| geometría | positivo | negativo | diferencia | t |");
console.log("|---|---|---|---|---|");
for (const [nom, sub, campo] of [["tres síes (±45)", t3, "pl45"], ["±45 todos los días", dias, "pl45"], ["±25 todos los días", dias, "pl25"]]) {
  const a = sub.filter((d) => d.gex > 0).map((d) => d[campo]);
  const b = sub.filter((d) => d.gex < 0).map((d) => d[campo]);
  if (a.length < 30 || b.length < 30) continue;
  const dif = media(a) - media(b);
  const se = Math.sqrt(sd(a) ** 2 / a.length + sd(b) ** 2 / b.length);
  console.log(`| ${nom} | ${eur(media(a))} | ${eur(media(b))} | **${eur(dif)}** | ${num(dif / se, 2)} |`);
}

// ── las dos mitades ─────────────────────────────────────────────────────────
const fs2 = [...new Set(dias.map((d) => d.fecha))].sort();
const corte = fs2[Math.floor(fs2.length / 2)];
console.log(`\n### Las dos mitades · corte en ${corte}\n`);
console.log("| qué | primera mitad | segunda mitad | ¿mismo signo? |");
console.log("|---|---|---|---|");
for (const [nom, sub, campo] of [["tres síes + GEX positivo", t3.filter((d) => d.gex > 0), "pl45"], ["tres síes, todos", t3, "pl45"]]) {
  const a = sub.filter((d) => d.fecha < corte).map((d) => d[campo]);
  const b = sub.filter((d) => d.fecha >= corte).map((d) => d[campo]);
  if (a.length < 20 || b.length < 20) continue;
  console.log(`| ${nom} | ${eur(media(a))} (n ${a.length}) | ${eur(media(b))} (n ${b.length}) | ${Math.sign(media(a)) === Math.sign(media(b)) ? "**sí**" : "NO"} |`);
}

// ── EL RIESGO, que es lo que decide ────────────────────────────────────────
// Elegir por $/año es el error que ya cometimos una vez: ordenando 35 geometrías, el riesgo se
// hereda (ρ=+0,98) y el ingreso va INVERTIDO (ρ=−0,66). Se elige por la caída, nunca por la caja.
function caida(pls) { let a = 0, p = 0, w = 0; for (const x of pls) { a += x; p = Math.max(p, a); w = Math.min(w, a - p); } return w; }
function rachaPerd(pls) { let m = 0, c = 0; for (const x of pls) { if (x < 0) { c++; m = Math.max(m, c); } else c = 0; } return m; }

console.log(`\n### EL RIESGO — porque elegir por dinero al año es el error que ya cometimos\n`);
console.log("| regla | días | al año | peor día | peor caída seguida | perdedoras seguidas |");
console.log("|---|---|---|---|---|---|");
const anosT = (Date.parse(dias[dias.length - 1].fecha) - Date.parse(dias[0].fecha)) / 86_400_000 / 365.25;
for (const [nom, sub, campo] of [
  ["tres síes (±45)", t3, "pl45"],
  ["tres síes + GEX positivo", t3.filter((d) => d.gex > 0), "pl45"],
  ["±25 sólo GEX positivo", dias.filter((d) => d.gex > 0), "pl25"],
  ["±45 sólo GEX positivo", dias.filter((d) => d.gex > 0), "pl45"],
  ["±25 sin ningún filtro", dias, "pl25"],
]) {
  const pls = sub.map((d) => d[campo]);
  console.log(`| ${nom} | ${pls.length} | **${eur(suma(pls) / anosT)}** | ${eur(Math.min(...pls))} | ${eur(caida(pls))} | ${rachaPerd(pls)} |`);
}

console.log(`\n${"=".repeat(96)}`);
if (base && conPos) {
  const gana = conPos.medio - base.medio;
  const pierdeDias = base.n - conPos.n;
  console.log(`  El cuarto sí quitaría ${pierdeDias} días de ${base.n} (${Math.round(pierdeDias / base.n * 100)}%)`);
  console.log(`  y cambiaría el resultado por operación en ${eur(gana)} (${eur(base.medio)} → ${eur(conPos.medio)})`);
  console.log(`  En dinero al año: ${eur(base.alAno)} → ${eur(conPos.alAno)}`);
}
console.log(`\n  ESTO NO CAMBIA LA REGLA DESPLEGADA. El pre-registro la congeló, y retocar un forward`);
console.log(`  test lo convierte en otra cosa. Si el cuarto sí saliera bien, se pre-registra APARTE.`);
console.log(`  Y son ${PRUEBAS_NUEVAS} pruebas nuevas sobre los mismos días, encima de las ~300 que ya lleva el proyecto.`);
console.log("=".repeat(96) + "\n");
