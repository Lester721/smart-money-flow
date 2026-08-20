// EXTRACTOR · 1.123 días de cadena 0DTE → dos ficheros compactos.
//
// POR QUÉ EXISTE: scripts/regimen-filas.json sólo cubre 653 días (2024-2026). Medir el calendario
// ahí es medir la muestra donde ya se eligió todo. Esto reconstruye los 1.123 días desde las
// cadenas, con el MISMO lector que scripts/descomponer-fuera-muestra.mjs (bid al vender, ask al
// comprar, cierre = último precio real del subyacente del día).
//
// Salida:
//   scripts/dsem-filas.json   — una fila por día
//   scripts/dsem-camino.json  — el camino de 5 min del subyacente (para rv de la mañana y colas)
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/dsem-extraer.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00";
const ALA = 50;          // ancho de las alas, en puntos
const SEP = 25;          // distancia del corto al spot, en puntos
const COMM = 0.03;       // por pata; se cobran 8 (4 de entrada + 4 de liquidación), igual que en
                         // los scripts anteriores del proyecto, para poder comparar cifras.

const CAMPOS = ["strike", "timestamp", "bid", "ask", "underlying_price", "implied_vol"];

/** Lee un fichero de un lado (C o P). Devuelve la cadena de las 11:00 y el camino del subyacente. */
function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const txt = readFileSync(f, "utf8");
  const lin = txt.split("\n");
  if (lin.length < 3) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = CAMPOS.map((c) => cab.indexOf(c));
  // Un campo que no existe se lee como 0 y se mide cero durante 45 minutos. Aquí se grita.
  if (idx.some((x) => x < 0)) throw new Error(`faltan columnas en ${f}: ${CAMPOS.filter((c, i) => idx[i] < 0).join(", ")}`);
  const [iK, iT, iB, iA, iU, iV] = idx;

  const camino = new Map();       // "HH:MM" → precio del subyacente
  const enHora = [];
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j];
    if (L.length < 20) continue;
    const c = L.split(",");
    const h = c[iT].slice(11, 16);
    const sp = +c[iU];
    if (sp > 0 && !camino.has(h)) camino.set(h, sp);
    if (h !== HORA) continue;
    const K = +c[iK], bid = +c[iB], ask = +c[iA], iv = +c[iV];
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, iv, spot: sp });
  }
  return enHora.length ? { filas: enHora, camino } : null;
}

const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const sd = (v) => { if (v.length < 2) return NaN; const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };

const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
console.log(`${fechas.length} fechas con fichero de CALL en disco`);

const filas = [], CAM = {}, saltados = [];
let hecho = 0;
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) { saltados.push([fecha, "sin filas a las 11:00"]); continue; }

  // camino común: horas ordenadas, precio de la primera fuente que lo tenga
  const horas = [...new Set([...C.camino.keys(), ...P.camino.keys()])].sort();
  const s = horas.map((h) => C.camino.get(h) ?? P.camino.get(h));
  const ok = horas.filter((h, i) => s[i] > 0);
  const sp = ok.map((h) => (C.camino.get(h) ?? P.camino.get(h)));
  if (sp.length < 20) { saltados.push([fecha, `camino de ${sp.length} puntos`]); continue; }

  const i11 = ok.indexOf(HORA);
  if (i11 < 1) { saltados.push([fecha, "sin precio de subyacente a las 11:00"]); continue; }
  const ap = sp[0], sp11 = sp[i11], cierre = sp[sp.length - 1], hFin = ok[ok.length - 1];
  if (!(ap > 0 && sp11 > 0 && cierre > 0)) { saltados.push([fecha, "precios a cero"]); continue; }

  // ── el cóndor: bid de lo vendido, ask de lo comprado, las cuatro patas ──
  const cC = cerca(C.filas, sp11 + SEP), pC = cerca(P.filas, sp11 - SEP);
  const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
  if (cL.K <= cC.K || pL.K >= pC.K) { saltados.push([fecha, "alas cruzadas"]); continue; }
  const credito = (cC.bid + pC.bid - cL.ask - pL.ask) * 100;
  if (!(credito > 0)) { saltados.push([fecha, `crédito ${credito.toFixed(0)}`]); continue; }
  const S = cierre;
  const pl = credito
    - Math.min(Math.max(S - cC.K, 0), cL.K - cC.K) * 100
    - Math.min(Math.max(pC.K - S, 0), pC.K - pL.K) * 100
    - 8 * COMM;

  // ── IV del dinero a las 11:00 (media de call y put más cercanas al spot) ──
  const cAtm = cerca(C.filas, sp11), pAtm = cerca(P.filas, sp11);
  const ivs = [cAtm.iv, pAtm.iv].filter((x) => x > 0.001 && x < 5);
  const ivAtm = ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : null;
  // σ implícita HASTA EL CIERRE, en puntos del índice (6,5 h de sesión, 252 días)
  const hh = (h) => +h.slice(0, 2) + +h.slice(3, 5) / 60;
  const horasRest = Math.max(0.1, hh(hFin) - hh(HORA));
  const sigma = ivAtm ? sp11 * ivAtm * Math.sqrt(horasRest / 6.5 / 252) : null;

  // ── forma de la MAÑANA (09:30 → 11:00): todo observable al entrar ──
  const man = sp.slice(0, i11 + 1);
  const maxM = Math.max(...man), minM = Math.min(...man);
  const rets = [];
  for (let j = 1; j < man.length; j++) rets.push(Math.log(man[j] / man[j - 1]));
  const rvMan = sd(rets) * Math.sqrt(78 * 252);

  // ── DESENLACE (prefijo z): sólo para explicar por qué dolió, nunca para decidir ──
  const tarde = sp.slice(i11);
  const zMaxSubida = Math.max(...tarde) - sp11, zMaxBajada = sp11 - Math.min(...tarde);

  filas.push({
    fecha, pl, credito, ap, sp11, cierre, maxM, minM,
    sigma, ivAtm, rvMan,
    kCallCorta: cC.K, kPutCorta: pC.K, kCallLarga: cL.K, kPutLarga: pL.K,
    hFin, nPuntos: sp.length,
    zTardePts: cierre - sp11, zMaxSubida, zMaxBajada,
    zRiesgoMax: ALA * 100 - credito,
  });
  CAM[fecha] = { h: ok, s: sp };
  if (++hecho % 100 === 0) console.log(`  ${hecho}/${fechas.length} · ${fecha}`);
}

console.log(`\n${filas.length} días construidos · ${saltados.length} saltados`);
for (const [f, m] of saltados.slice(0, 40)) console.log(`  saltado ${f}: ${m}`);

// El descarte no puede comerse la muestra sin gritar.
if (filas.length < fechas.length * 0.9) {
  throw new Error(`sólo sobrevivieron ${filas.length} de ${fechas.length} días (${(filas.length / fechas.length * 100).toFixed(1)}%). Eso no es un resultado, es un bug.`);
}

const porAno = {};
for (const f of filas) porAno[f.fecha.slice(0, 4)] = (porAno[f.fecha.slice(0, 4)] ?? 0) + 1;
console.log(`por año: ${JSON.stringify(porAno)}`);
console.log(`rango: ${filas[0].fecha} → ${filas[filas.length - 1].fecha}`);

writeFileSync("scripts/dsem-filas.json", JSON.stringify(filas));
writeFileSync("scripts/dsem-camino.json", JSON.stringify(CAM));
console.log("escritos scripts/dsem-filas.json y scripts/dsem-camino.json");
